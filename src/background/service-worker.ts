// -----------------------------------------------------------------------------
// TrackVid — marketplace session capture (MV3 service worker)
// -----------------------------------------------------------------------------
// Detects a successful seller-portal login in this browser, harvests the
// session material, and POSTs it to the TrackVid backend. Auth: the extension
// logs the operator into TrackVid (via email+password OR the "Have User ID"
// impersonation shortcut), stores the returned access token, and attaches it as
// a Bearer header on every ingest request. On a 401 the token is cleared and the
// popup asks the operator to click Verify again.
//
// TWO platforms are supported, described by the PLATFORMS table below:
//
//   Myntra   — cookies only (`erp.at` + `session`), POST /api/myntra/ingest-session
//   Flipkart — cookies PLUS the `fk-csrf-token` header that signs every one of
//              its GraphQL calls, POST /api/flipkart/ingest-session
//
// The Flipkart token is not a cookie: the portal keeps it in page storage and
// attaches it as a request header. We already read request headers to get at
// HttpOnly+Partitioned cookies, so the same listener sniffs the token — no
// content script and no page-context access needed.
// -----------------------------------------------------------------------------

import type {
  BgState,
  CapturedSession,
  Settings,
  SessionStatus,
  VerifyStatus,
} from "@/lib/types";

export type PlatformKey = "myntra" | "flipkart";

interface PlatformSpec {
  key: PlatformKey;
  label: string;
  // POSTs to these URLs mean "a login just happened" — success is judged by the
  // response status in onCompleted.
  loginUrlPatterns: string[];
  // Every URL whose headers we mine for cookies (and, on Flipkart, the csrf
  // token). Wider than the login patterns on purpose: the session material is
  // set across the portal, not only on the login call.
  allUrlPatterns: string[];
  // chrome.cookies.getAll({domain}) matches subdomains, so the dotted entries
  // catch everything; the explicit hosts just make the debug log readable.
  cookieDomains: string[];
  // Cookies without which the capture is worthless. Empty = "any non-empty jar",
  // used for Flipkart where the session cookie names are not fixed.
  requiredCookies: readonly string[];
  // Flipkart only: the request header carrying the token that signs its API
  // calls. When set, a capture without it is rejected.
  csrfHeader?: string;
  // Flipkart only: the cookie that MUST hold the same value as csrfHeader.
  // Flipkart uses double-submit CSRF — the server compares header against
  // cookie and answers 403 EBADCSRFTOKEN when they differ — so a capture whose
  // jar lacks this cookie is dead on arrival however fresh it looks.
  csrfCookie?: string;
  ingestPath: string;
}

const PLATFORMS: Record<PlatformKey, PlatformSpec> = {
  myntra: {
    key: "myntra",
    label: "Myntra",
    loginUrlPatterns: [
      "https://accounts.myntra.com/*login*",
      "https://accounts.myntrainfo.com/*login*",
      "https://partners.myntrainfo.com/*login*",
    ],
    allUrlPatterns: ["https://*.myntra.com/*", "https://*.myntrainfo.com/*"],
    cookieDomains: [
      "myntrainfo.com",
      ".myntrainfo.com",
      "partners.myntrainfo.com",
      "partnersapi.myntrainfo.com",
      "myntra.com",
      ".myntra.com",
      "accounts.myntra.com",
      "www.myntra.com",
    ],
    requiredCookies: ["erp.at", "session"] as const,
    ingestPath: "/api/myntra/ingest-session",
  },
  flipkart: {
    key: "flipkart",
    label: "Flipkart",
    // Flipkart's login is one or two calls: POST /login, and POST /verifyOtp
    // when an OTP is challenged (it is not always). Both are watched — /login
    // also carries the username in its body — and which of them yields a usable
    // session is decided by requiredCookies, not by the URL.
    loginUrlPatterns: [
      "https://seller.flipkart.com/login*",
      "https://seller.flipkart.com/verifyOtp*",
    ],
    allUrlPatterns: ["https://seller.flipkart.com/*"],
    cookieDomains: [
      "flipkart.com",
      ".flipkart.com",
      "seller.flipkart.com",
    ],
    // `sellerId` is the authenticated-seller marker: it is present in every
    // working jar we have and is not set while login is still mid-MFA, which is
    // what lets one capture path serve both the OTP and no-OTP flows. The csrf
    // cookie below is required too — see csrfCookie.
    requiredCookies: ["sellerId"] as const,
    csrfHeader: "fk-csrf-token",
    csrfCookie: "XyZ7pQ9rS2T1uV8wA3bC6dE4fG0h",
    ingestPath: "/api/flipkart/ingest-session",
  },
};

const PLATFORM_LIST = Object.values(PLATFORMS);

// Which platform a URL belongs to, or null when it's neither.
function platformForUrl(url: string): PlatformSpec | null {
  if (/^https:\/\/([a-z0-9-]+\.)*myntra(info)?\.com\//i.test(url)) return PLATFORMS.myntra;
  if (/^https:\/\/seller\.flipkart\.com\//i.test(url)) return PLATFORMS.flipkart;
  return null;
}

// TEMPORARY diagnostic logging. Flip to false once cookie capture is stable.
const TVX_DEBUG = true;
const dlog = (...args: unknown[]) => {
  if (TVX_DEBUG) console.log("[TVX]", ...args);
};

// Truncate a cookie value for logs so we never dump secrets.
const truncVal = (v: string) =>
  v.length <= 12 ? v : `${v.slice(0, 6)}…${v.slice(-4)} (${v.length}b)`;

// -----------------------------------------------------------------------------
// Header-sourced cookie jar
// -----------------------------------------------------------------------------
// chrome.cookies.getAll cannot see HttpOnly + Partitioned (CHIPS) cookies
// without the right partitionKey. Myntra's `erp.at` and `session` fall in that
// bucket — proven by cookies.getAll returning 0 while an authenticated POST to
// partnersapi.myntrainfo.com succeeded.
//
// Reading Cookie / Set-Cookie headers via webRequest with `extraHeaders`
// bypasses that limitation entirely. We keep a running jar populated from
// every Myntra request the browser makes and pull from it at capture time.
// -----------------------------------------------------------------------------

// One jar per platform — a Myntra cookie must never leak into a Flipkart
// capture, and both portals can be open in the same browser at once.
const headerJars: Record<PlatformKey, Record<string, string>> = {
  myntra: {},
  flipkart: {},
};

// Flipkart's fk-csrf-token, sniffed from request headers. Not a cookie, so it
// lives beside the jar rather than in it.
const csrfTokens: Partial<Record<PlatformKey, string>> = {};

function ingestSetCookieHeader(headerJar: Record<string, string>, raw: string, sourceUrl: string) {
  // Chrome may combine multiple Set-Cookie into one string separated by \n
  // (rare but happens). Handle both shapes.
  for (const line of raw.split(/\r?\n/)) {
    const first = line.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name || !value) continue;
    // Ignore deletion markers.
    if (value === "" || value.toLowerCase() === "deleted") continue;
    headerJar[name] = value;
    dlog(`Set-Cookie ${name}=${truncVal(value)} from ${sourceUrl}`);
  }
}

function ingestCookieRequestHeader(headerJar: Record<string, string>, raw: string, sourceUrl: string) {
  for (const pair of raw.split(";")) {
    const idx = pair.indexOf("=");
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name || !value) continue;
    // Only overwrite if we don't already have this from Set-Cookie (Set-Cookie
    // is authoritative; the Cookie header is a fallback).
    if (!headerJar[name]) headerJar[name] = value;
  }
  dlog(
    `Cookie header seen for ${sourceUrl} — headerJar now has ${Object.keys(headerJar).length} names`
  );
}

// Backend base URL is env-only now — the popup no longer exposes it.
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "").trim();

// Secure mode: when true, a captured session is held locally and only POSTed
// after the operator has opened AND closed the extension popup. This gives
// them a chance to review the capture before it leaves the machine. When
// false/unset, sync runs immediately on capture (the original flow).
const SECURE_MODE =
  String(import.meta.env.VITE_SECURE_MODE ?? "").toLowerCase() === "true";

const STORAGE_KEYS = {
  settings: "tv.settings",
  lastCapture: "tv.lastCapture",
  // Only meaningful in SECURE_MODE: set when a capture is waiting for the next
  // popup-close to trigger its upload. Persisted (not just in-memory) because
  // the service worker can hibernate between capture and popup close.
  pendingSecureSync: "tv.pendingSecureSync",
} as const;

// -----------------------------------------------------------------------------
// In-memory state (service worker may hibernate — always rehydrate from storage
// before answering the popup).
// -----------------------------------------------------------------------------

let status: SessionStatus = "idle";
let lastMessage: string | null = null;
let verifyMessage: string | null = null;
let inflightUsername: string | null = null;

// -----------------------------------------------------------------------------
// Storage helpers
// -----------------------------------------------------------------------------

async function loadSettings(): Promise<Settings> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.settings);
  // Reshape stored data explicitly. Old installs may still have `companyId`,
  // `backendUrl`, or `authToken` in storage; ignore those and hydrate the
  // current shape from defaults for anything missing.
  const stored = (raw[STORAGE_KEYS.settings] || {}) as Partial<Settings>;
  return {
    useUserId: typeof stored.useUserId === "boolean" ? stored.useUserId : false,
    userId: typeof stored.userId === "string" ? stored.userId : "",
    userEmail: typeof stored.userEmail === "string" ? stored.userEmail : "",
    password: typeof stored.password === "string" ? stored.password : "",
    savePassword:
      typeof stored.savePassword === "boolean" ? stored.savePassword : false,
    accessToken: typeof stored.accessToken === "string" ? stored.accessToken : "",
    tokenSavedAt:
      typeof stored.tokenSavedAt === "string" ? stored.tokenSavedAt : "",
    autoSync: typeof stored.autoSync === "boolean" ? stored.autoSync : true,
  };
}

async function saveSettings(next: Settings): Promise<void> {
  // Never persist password on disk unless the operator opted in.
  const toStore: Settings = {
    ...next,
    password: next.savePassword ? next.password : "",
  };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: toStore });
}

async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: next });
  return next;
}

async function loadLastCapture(): Promise<CapturedSession | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.lastCapture);
  return (raw[STORAGE_KEYS.lastCapture] as CapturedSession) || null;
}

async function saveLastCapture(c: CapturedSession | null): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.lastCapture]: c });
}

async function loadPendingSecureSync(): Promise<boolean> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.pendingSecureSync);
  return raw[STORAGE_KEYS.pendingSecureSync] === true;
}

async function savePendingSecureSync(flag: boolean): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.pendingSecureSync]: flag });
}

// Mirrors the popup's field validation (SettingsScreen.tsx). Checked here too
// because settings persisted by an older build are not re-validated on load.
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function hasCredentials(s: Settings): boolean {
  if (s.useUserId) return OBJECT_ID_RE.test(s.userId.trim());
  return s.userEmail.trim().length > 0 && s.password.trim().length > 0;
}

function computeVerify(s: Settings): VerifyStatus {
  if (s.accessToken) return "verified";
  if (!hasCredentials(s)) return "unverified";
  return "ready";
}

async function currentState(): Promise<BgState> {
  const [settings, lastCapture] = await Promise.all([
    loadSettings(),
    loadLastCapture(),
  ]);
  const s =
    settings.accessToken && status === "idle" ? "watching" : status;
  return {
    settings,
    status: s,
    verify: computeVerify(settings),
    verifyMessage,
    lastCapture,
    lastMessage,
  };
}

async function broadcastState(): Promise<void> {
  const state = await currentState();
  try {
    await chrome.runtime.sendMessage({ type: "STATE_UPDATE", state });
  } catch {
    /* popup may be closed — silent */
  }
}

function setStatus(next: SessionStatus, message: string | null = null) {
  status = next;
  lastMessage = message;
  broadcastState();
}

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------

interface LoginResponse {
  isSuccess: boolean;
  message?: string;
  displayMessage?: string;
  data?: { accessToken?: string };
}

async function performLogin(settings: Settings): Promise<{
  accessToken: string;
  savedAt: string;
}> {
  if (!BACKEND_URL) {
    throw new Error("Backend URL is not configured (VITE_BACKEND_URL).");
  }
  const base = BACKEND_URL.replace(/\/+$/, "");

  // "Have User ID" reuses the existing system-admin impersonation endpoint
  // (GET /api/system-admin/:id) rather than a dedicated auth route — it mints
  // the same token from the same user lookup, so there is no second
  // password-less login surface to keep secured. It returns the same
  // { data: { accessToken } } envelope as /api/auth/login.
  let res: Response;
  if (settings.useUserId) {
    // That endpoint does no id validation of its own — a non-ObjectId makes
    // the Mongo cast throw and comes back as an opaque 500, so check here.
    const userId = settings.userId.trim();
    if (!OBJECT_ID_RE.test(userId)) {
      throw new Error("User ID must be a 24-character hex ObjectId.");
    }
    res = await fetch(`${base}/api/system-admin/${encodeURIComponent(userId)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } else {
    res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: settings.userEmail.trim().toLowerCase(),
        password: settings.password,
      }),
    });
  }
  const json = (await res.json().catch(() => ({}))) as LoginResponse;

  if (!res.ok || !json.isSuccess || !json.data?.accessToken) {
    const msg =
      json.displayMessage ||
      json.message ||
      `Login failed (${res.status})`;
    throw new Error(msg);
  }
  return { accessToken: json.data.accessToken, savedAt: new Date().toISOString() };
}

async function verifyLogin(): Promise<BgState> {
  const settings = await loadSettings();
  if (!hasCredentials(settings)) {
    verifyMessage = settings.useUserId
      ? "Enter a valid 24-character User ID before verifying."
      : "Enter your email and password before verifying.";
    return currentState();
  }
  verifyMessage = "Verifying with TrackVid…";
  broadcastState();
  try {
    const { accessToken, savedAt } = await performLogin(settings);
    // Fresh login → drop any capture from a prior session/user so nothing
    // from the previous account lingers on the popup or gets re-synced.
    await saveLastCapture(null);
    await patchSettings({ accessToken, tokenSavedAt: savedAt });
    verifyMessage = "Verified.";
    setStatus("watching");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await patchSettings({ accessToken: "", tokenSavedAt: "" });
    verifyMessage = msg;
    setStatus("error", msg);
  }
  return currentState();
}

async function performLogout(): Promise<BgState> {
  // Clear the token, the saved password, and any captured session. Keep the
  // identifying fields (email OR userId + useUserId toggle + savePassword +
  // autoSync) so the operator doesn't have to retype on re-verify.
  await patchSettings({ accessToken: "", tokenSavedAt: "", password: "" });
  await saveLastCapture(null);
  await savePendingSecureSync(false);
  verifyMessage = "Logged out.";
  setStatus("idle");
  return currentState();
}

// -----------------------------------------------------------------------------
// Cookie harvest
// -----------------------------------------------------------------------------

async function harvestCookies(spec: PlatformSpec): Promise<Record<string, string>> {
  const jar: Record<string, string> = {};
  // Scan the wider diagnostic list — the harvest itself doesn't care where a
  // cookie is scoped, and this way the diag log below shows every hit.
  const seen: Array<{
    name: string;
    domain: string;
    path: string;
    len: number;
    secure: boolean;
    httpOnly: boolean;
  }> = [];

  for (const domain of spec.cookieDomains) {
    let cookies: chrome.cookies.Cookie[] = [];
    try {
      cookies = await chrome.cookies.getAll({ domain });
    } catch (err) {
      dlog(`getAll(domain=${domain}) threw`, err);
      continue;
    }
    dlog(`getAll(domain=${domain}) → ${cookies.length} cookies`);
    for (const c of cookies) {
      seen.push({
        name: c.name,
        domain: c.domain,
        path: c.path,
        len: c.value.length,
        secure: c.secure,
        httpOnly: c.httpOnly,
      });
      // Prefer the most specific (longest domain) if a name collides.
      const priorDomain = jar[`${c.name}__d`];
      if (!jar[c.name] || c.domain.length > (priorDomain?.length ?? 0)) {
        jar[c.name] = c.value;
        jar[`${c.name}__d`] = c.domain;
      }
    }
  }
  for (const k of Object.keys(jar)) if (k.endsWith("__d")) delete jar[k];

  // Merge the header-sourced jar for THIS platform. Header-sourced values win —
  // they're the ones the browser actually sends, and getAll can silently miss
  // HttpOnly + Partitioned cookies.
  for (const [name, value] of Object.entries(headerJars[spec.key])) {
    jar[name] = value;
  }

  if (TVX_DEBUG) {
    console.groupCollapsed(`[TVX] cookies visible to extension (${seen.length})`);
    for (const c of seen) {
      console.log(
        `  ${c.name.padEnd(20)}  domain=${c.domain}  path=${c.path}  len=${c.len}  secure=${c.secure}  httpOnly=${c.httpOnly}`
      );
    }
    console.groupEnd();
    const hj = headerJars[spec.key];
    dlog(
      `[${spec.key}] headerJar size=${Object.keys(hj).length} keys=[${Object.keys(hj).join(", ")}]`
    );
    dlog(`[${spec.key}] merged harvest jar keys:`, Object.keys(jar));
    for (const req of spec.requiredCookies) {
      dlog(`required "${req}" → ${jar[req] ? truncVal(jar[req]) : "MISSING"}`);
    }
    if (spec.csrfHeader) {
      dlog(
        `required header "${spec.csrfHeader}" → ${
          csrfTokens[spec.key] ? truncVal(csrfTokens[spec.key] as string) : "MISSING"
        }`
      );
    }
  }

  return jar;
}

// Retry harvesting: cookies set by a login redirect chain don't always land in
// Chrome's cookie store the instant the POST completes. Retry with backoff and
// stop as soon as the required cookies appear.
async function harvestCookiesWithRetry(
  spec: PlatformSpec
): Promise<Record<string, string>> {
  const delays = [400, 800, 1500, 2500, 4000]; // total ~9.2s
  let last: Record<string, string> = {};
  for (let i = 0; i < delays.length; i++) {
    await new Promise((r) => setTimeout(r, delays[i]));
    dlog(`[${spec.key}] harvest attempt ${i + 1}/${delays.length} (after ${delays[i]}ms wait)`);
    last = await harvestCookies(spec);
    if (hasRequiredMaterial(spec, last)) {
      dlog(`✔ [${spec.key}] required material present on attempt ${i + 1}`);
      return last;
    }
  }
  dlog(`✘ [${spec.key}] required material never appeared after all retries`);
  return last;
}

// "Enough to be worth sending". Myntra names its two cookies explicitly;
// Flipkart takes any non-empty jar but insists on the csrf token, without which
// the automation cannot sign a single API call.
function hasRequiredMaterial(
  spec: PlatformSpec,
  jar: Record<string, string>
): boolean {
  if (spec.requiredCookies.length > 0) {
    if (!spec.requiredCookies.every((n) => !!jar[n])) return false;
  } else if (Object.keys(jar).length === 0) {
    return false;
  }
  // Double-submit platforms need BOTH halves. Sending a token with no matching
  // cookie produces a session that looks healthy and 403s on its first call.
  if (spec.csrfCookie && !jar[spec.csrfCookie]) return false;
  if (spec.csrfHeader && !csrfToken(spec, jar)) return false;
  return true;
}

// The value to send as `csrfToken`. The COOKIE is the source of truth: it is the
// half the server compares against, and taking it from the jar guarantees the
// pair matches even if the SPA rotated the token after we sniffed a header.
// The sniffed header is only a fallback for a jar that somehow lacks the cookie.
function csrfToken(
  spec: PlatformSpec,
  jar: Record<string, string>
): string | undefined {
  if (spec.csrfCookie && jar[spec.csrfCookie]) {
    const sniffed = csrfTokens[spec.key];
    if (sniffed && sniffed !== jar[spec.csrfCookie]) {
      dlog(
        `[${spec.key}] header token differs from cookie "${spec.csrfCookie}" — using the cookie`
      );
    }
    return jar[spec.csrfCookie];
  }
  return csrfTokens[spec.key];
}

// -----------------------------------------------------------------------------
// Username sniff — read the login request body when the browser lets us.
// -----------------------------------------------------------------------------

function extractUsernameFromBody(
  requestBody: chrome.webRequest.WebRequestBody | undefined
): string | null {
  if (!requestBody) return null;
  const candidateKeys = ["email", "username", "userName", "loginId", "user"];
  if (requestBody.formData) {
    for (const key of candidateKeys) {
      const v = requestBody.formData[key];
      if (v && v[0]) return String(v[0]);
    }
  }
  if (requestBody.raw && requestBody.raw[0]?.bytes) {
    try {
      const text = new TextDecoder().decode(requestBody.raw[0].bytes as ArrayBuffer);
      try {
        const parsed = JSON.parse(text);
        for (const key of candidateKeys) {
          if (parsed && typeof parsed[key] === "string") return parsed[key];
        }
      } catch {
        /* not JSON — try URL-encoded */
      }
      const params = new URLSearchParams(text);
      for (const key of candidateKeys) {
        const v = params.get(key);
        if (v) return v;
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// BE sync
// -----------------------------------------------------------------------------

async function sendToBackend(
  capture: CapturedSession,
  settings: Settings
): Promise<void> {
  if (!BACKEND_URL) throw new Error("Backend URL is not configured (VITE_BACKEND_URL).");
  if (!settings.accessToken) throw new Error("Not verified — click Verify first.");
  const spec = PLATFORMS[capture.platform ?? "myntra"];
  const url = BACKEND_URL.replace(/\/+$/, "") + spec.ingestPath;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.accessToken}`,
    },
    body: JSON.stringify({
      username: capture.username,
      jar: capture.cookies,
      // Only Flipkart's endpoint expects this; Myntra's ignores the extra key.
      ...(capture.csrfToken ? { csrfToken: capture.csrfToken } : {}),
      source: "chrome-extension",
      capturedAt: capture.capturedAt,
    }),
  });

  if (res.status === 401) {
    // Token expired or revoked — clear it so the popup can prompt re-verify.
    await patchSettings({ accessToken: "", tokenSavedAt: "" });
    verifyMessage = "Session expired. Click Verify to log in again.";
    broadcastState();
    throw new Error("Access token expired — click Verify to log in again.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Backend ${res.status}: ${text.slice(0, 200)}`);
  }
}

// -----------------------------------------------------------------------------
// Login-detected pipeline
// -----------------------------------------------------------------------------

async function onLoginDetected(
  spec: PlatformSpec,
  usernameHint: string | null
): Promise<void> {
  const settings = await loadSettings();
  if (!settings.accessToken) {
    setStatus(
      "error",
      `${spec.label} login detected, but TrackVid isn't verified. Open the extension and click Verify.`
    );
    notify(
      "Verification required",
      `TrackVid saw a ${spec.label} login but is not verified. Click Verify in the popup.`
    );
    return;
  }

  setStatus("capturing", `Detected login for ${usernameHint || `${spec.label} user`}`);
  dlog(`onLoginDetected [${spec.key}] — usernameHint:`, usernameHint);

  const jar = await harvestCookiesWithRetry(spec);
  if (!hasRequiredMaterial(spec, jar)) {
    const seenNames = Object.keys(jar);
    const missing: string[] = spec.requiredCookies.filter((n) => !jar[n]);
    if (spec.requiredCookies.length === 0 && seenNames.length === 0) {
      missing.push("any cookie");
    }
    if (spec.csrfCookie && !jar[spec.csrfCookie]) missing.push(`cookie ${spec.csrfCookie}`);
    if (spec.csrfHeader && !csrfToken(spec, jar)) missing.push(spec.csrfHeader);
    const debugMsg =
      `${spec.label} login detected but required material missing (${missing.join(", ")}). ` +
      `Saw ${seenNames.length} cookies: [${seenNames.slice(0, 12).join(", ")}${seenNames.length > 12 ? ", …" : ""}]`;
    dlog(debugMsg);
    setStatus("error", debugMsg);
    return;
  }

  // Past the gate — this capture is real, so the username hint has been used
  // and must not leak into an unrelated later login.
  const resolvedUsername = usernameHint || inflightUsername || "(unknown)";
  inflightUsername = null;

  const capture: CapturedSession = {
    platform: spec.key,
    username: resolvedUsername,
    userEmail: settings.userEmail || settings.userId || "(via token)",
    cookies: jar,
    ...(spec.csrfHeader ? { csrfToken: csrfToken(spec, jar) } : {}),
    capturedAt: new Date().toISOString(),
  };
  await saveLastCapture(capture);

  if (!settings.autoSync) {
    setStatus("success", "Captured — auto-sync disabled, re-sync manually.");
    return;
  }

  if (SECURE_MODE) {
    // Hold the capture; syncPendingCapture() runs when the popup port
    // disconnects (see chrome.runtime.onConnect below).
    await savePendingSecureSync(true);
    setStatus(
      "success",
      `${spec.label} session captured — will sync after you close the TrackVid popup.`
    );
    notify(
      "TrackVid — session captured",
      `${spec.label} session for ${capture.username} captured. Open TrackVid to review, then close it to sync.`
    );
    return;
  }

  setStatus("syncing", "Uploading cookie jar to TrackVid…");
  try {
    await sendToBackend(capture, settings);
    capture.syncedAt = new Date().toISOString();
    await saveLastCapture(capture);
    setStatus("success", `${spec.label} session synced for ${capture.username}`);
    notify(
      "TrackVid — session synced",
      `${spec.label} session for ${capture.username} was sent to the backend.`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    capture.error = msg;
    await saveLastCapture(capture);
    setStatus("error", msg);
  }
}

function notify(title: string, message: string) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("src/assets/icon-128.png"),
      title,
      message,
      priority: 1,
    });
  } catch {
    /* notifications permission may be denied — non-fatal */
  }
}

// -----------------------------------------------------------------------------
// Wire up webRequest listeners
// -----------------------------------------------------------------------------

const ALL_LOGIN_URL_PATTERNS = PLATFORM_LIST.flatMap((p) => p.loginUrlPatterns);
const ALL_PORTAL_URL_PATTERNS = PLATFORM_LIST.flatMap((p) => p.allUrlPatterns);

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST") return;
    const user = extractUsernameFromBody(details.requestBody || undefined);
    dlog(
      `onBeforeRequest matched: ${details.method} ${details.url} — usernameHint=${user ?? "(none)"}`
    );
    // Flipkart's username arrives on POST /login, but the session only exists
    // after POST /verifyOtp — so the hint has to survive between the two calls,
    // which is exactly what inflightUsername does.
    if (user) inflightUsername = user;
  },
  { urls: ALL_LOGIN_URL_PATTERNS },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== "POST") return;
    const spec = platformForUrl(details.url);
    if (!spec) return;

    dlog(
      `onCompleted matched [${spec.key}]: ${details.method} ${details.url} → status=${details.statusCode} type=${details.type}`
    );
    if (details.statusCode < 200 || details.statusCode >= 400) {
      dlog("  ignored — non-2xx/3xx");
      return;
    }

    // Both Flipkart login calls reach here (/login, then /verifyOtp when an OTP
    // is challenged). We do NOT gate on which one fired: Flipkart skips the OTP
    // for some accounts entirely — the Selenium runner logs "(no OTP modal —
    // continuing)" — so waiting for /verifyOtp would mean those accounts are
    // never captured at all. Instead the capture is gated on evidence that a
    // session actually exists (spec.requiredCookies), which an MFA challenge
    // does not yet produce. A pre-OTP /login is therefore withheld on its own
    // merits and the /verifyOtp that follows captures for real.

    // NOT cleared here. A withheld capture (Flipkart's /login while the MFA is
    // still pending) must leave the hint intact, because the username only
    // appears in THAT request's body — clearing it would leave the /verifyOtp
    // capture that follows with "(unknown)". onLoginDetected clears it once a
    // capture actually succeeds.
    void onLoginDetected(spec, inflightUsername);
  },
  { urls: ALL_LOGIN_URL_PATTERNS }
);

// -----------------------------------------------------------------------------
// TEMPORARY diagnostic: log EVERY portal POST so we can see the login pattern.
// -----------------------------------------------------------------------------
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== "POST") return;
    dlog(`[all-POST] ${details.url} → ${details.statusCode}  type=${details.type}`);
  },
  { urls: ALL_PORTAL_URL_PATTERNS }
);

// -----------------------------------------------------------------------------
// Session material captured from headers — the only way to see HttpOnly +
// Partitioned cookies in MV3. Both listeners require ["extraHeaders"] in the
// extraInfoSpec or Chrome strips Cookie / Set-Cookie for security. This is why
// the earlier getAll-only approach missed erp.at and session.
//
// The same request-header listener also yields Flipkart's fk-csrf-token, which
// is not a cookie at all: the portal reads it from its own storage and attaches
// it as a header on every API call. Sniffing it here avoids a content script.
// -----------------------------------------------------------------------------

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.responseHeaders) return;
    const spec = platformForUrl(details.url);
    if (!spec) return;
    for (const h of details.responseHeaders) {
      if (h.name.toLowerCase() === "set-cookie" && h.value) {
        ingestSetCookieHeader(headerJars[spec.key], h.value, details.url);
      }
    }
  },
  { urls: ALL_PORTAL_URL_PATTERNS },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;
    const spec = platformForUrl(details.url);
    if (!spec) return;
    for (const h of details.requestHeaders) {
      const name = h.name.toLowerCase();
      if (name === "cookie" && h.value) {
        ingestCookieRequestHeader(headerJars[spec.key], h.value, details.url);
      }
      if (spec.csrfHeader && name === spec.csrfHeader && h.value) {
        if (csrfTokens[spec.key] !== h.value) {
          csrfTokens[spec.key] = h.value;
          dlog(`[${spec.key}] ${spec.csrfHeader}=${truncVal(h.value)} from ${details.url}`);
        }
      }
    }
  },
  { urls: ALL_PORTAL_URL_PATTERNS },
  ["requestHeaders", "extraHeaders"]
);

// -----------------------------------------------------------------------------
// SECURE_MODE deferred sync
// -----------------------------------------------------------------------------
// The popup opens a long-lived port (chrome.runtime.connect) on mount. When
// the popup window is destroyed — which Chrome does the moment it loses
// focus — the port disconnects and this listener fires. That's the signal we
// use in SECURE_MODE to release the held capture.
//
// Why a port instead of window.unload in the popup: unload/beforeunload are
// unreliable in extension popups (the SW may be asleep, and force-close paths
// skip them). Port disconnect is Chrome's own lifecycle signal and always
// fires.
// -----------------------------------------------------------------------------

async function syncPendingCapture(): Promise<void> {
  if (!SECURE_MODE) return;
  const pending = await loadPendingSecureSync();
  if (!pending) return;

  const [settings, cap] = await Promise.all([loadSettings(), loadLastCapture()]);
  if (!cap || cap.syncedAt) {
    await savePendingSecureSync(false);
    return;
  }
  if (!settings.accessToken) {
    // No token — keep the pending flag; the next popup-close after Verify
    // will retry. Surface the state so the popup shows a useful message
    // next time it opens.
    setStatus("error", "Captured session held — click Verify to enable sync.");
    return;
  }

  const spec = PLATFORMS[cap.platform ?? "myntra"];
  setStatus("syncing", "Uploading cookie jar to TrackVid…");
  try {
    await sendToBackend(cap, settings);
    cap.syncedAt = new Date().toISOString();
    await saveLastCapture(cap);
    await savePendingSecureSync(false);
    setStatus("success", `${spec.label} session synced for ${cap.username}`);
    notify(
      "TrackVid — session synced",
      `${spec.label} session for ${cap.username} was sent to the backend.`
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    cap.error = msg;
    await saveLastCapture(cap);
    // Leave pending=true so the next popup close retries.
    setStatus("error", msg);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  dlog("popup opened (port connected)");
  port.onDisconnect.addListener(() => {
    dlog("popup closed (port disconnected)");
    void syncPendingCapture();
  });
});

// -----------------------------------------------------------------------------
// Popup ↔ worker messaging
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "GET_STATE": {
          sendResponse(await currentState());
          return;
        }
        case "SAVE_SETTINGS": {
          const incoming = message.settings as Settings;
          // Preserve managed fields — the popup should never overwrite these
          // via the settings form. Verify does that.
          const prior = await loadSettings();
          const merged: Settings = {
            ...incoming,
            accessToken: prior.accessToken,
            tokenSavedAt: prior.tokenSavedAt,
          };
          await saveSettings(merged);
          if (status === "idle") setStatus("idle");
          sendResponse(await currentState());
          return;
        }
        case "VERIFY_LOGIN": {
          sendResponse(await verifyLogin());
          return;
        }
        case "LOGOUT": {
          sendResponse(await performLogout());
          return;
        }
        case "RESYNC_LAST": {
          const settings = await loadSettings();
          const cap = await loadLastCapture();
          if (!cap) {
            sendResponse(await currentState());
            return;
          }
          setStatus("syncing", "Re-uploading cookie jar…");
          try {
            await sendToBackend(cap, settings);
            cap.syncedAt = new Date().toISOString();
            await saveLastCapture(cap);
            setStatus("success", `Session re-synced for ${cap.username}`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            setStatus("error", msg);
          }
          sendResponse(await currentState());
          return;
        }
        case "CLEAR_LAST": {
          await saveLastCapture(null);
          await savePendingSecureSync(false);
          setStatus("idle");
          sendResponse(await currentState());
          return;
        }
        case "HARVEST_NOW": {
          // TEMPORARY diagnostic hook. Call from the popup or service-worker
          // devtools console: chrome.runtime.sendMessage({type:"HARVEST_NOW"})
          // Optional { platform } picks which portal to scan; defaults to
          // whichever has already yielded session material, else Myntra.
          const wanted = (message.platform as PlatformKey) || null;
          const spec =
            (wanted && PLATFORMS[wanted]) ||
            PLATFORM_LIST.find((pl) => Object.keys(headerJars[pl.key]).length > 0) ||
            PLATFORMS.myntra;
          dlog(`HARVEST_NOW — forcing a fresh scan for ${spec.key}`);
          void onLoginDetected(spec, null);
          sendResponse(await currentState());
          return;
        }
        default:
          sendResponse(await currentState());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ error: msg, state: await currentState() });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await loadSettings();
  if (settings.accessToken) setStatus("watching");
});
