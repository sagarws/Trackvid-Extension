// -----------------------------------------------------------------------------
// TrackVid — Myntra session capture (MV3 service worker)
// -----------------------------------------------------------------------------
// Detects a successful Myntra partner-portal login in this browser, harvests
// the `erp.at` and `session` cookies from Chrome's cookie store, and POSTs
// them to the TrackVid backend. Auth: the extension logs the operator into
// TrackVid (via email+password OR the "Have User ID" impersonation shortcut),
// stores the returned access token, and attaches it as a Bearer header on
// every ingest request. On a 401 the token is cleared and the popup asks the
// operator to click Verify again.
// -----------------------------------------------------------------------------

import type {
  BgState,
  CapturedSession,
  Settings,
  SessionStatus,
  VerifyStatus,
} from "@/lib/types";

const LOGIN_URL_PATTERNS = [
  "https://accounts.myntra.com/*login*",
  "https://accounts.myntrainfo.com/*login*",
  "https://partners.myntrainfo.com/*login*",
];

const REQUIRED_COOKIES = ["erp.at", "session"] as const;

// Diagnostic scan list — chrome.cookies.getAll({domain}) matches subdomains,
// so the `.myntrainfo.com` / `.myntra.com` entries catch everything, but the
// explicit hosts make the per-domain log line easy to read while debugging.
const DIAG_COOKIE_DOMAINS = [
  "myntrainfo.com",
  ".myntrainfo.com",
  "partners.myntrainfo.com",
  "partnersapi.myntrainfo.com",
  "myntra.com",
  ".myntra.com",
  "accounts.myntra.com",
  "www.myntra.com",
];

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

const headerJar: Record<string, string> = {};

function ingestSetCookieHeader(raw: string, sourceUrl: string) {
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

function ingestCookieRequestHeader(raw: string, sourceUrl: string) {
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

const STORAGE_KEYS = {
  settings: "tv.settings",
  lastCapture: "tv.lastCapture",
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
  verifyMessage = "Logged out.";
  setStatus("idle");
  return currentState();
}

// -----------------------------------------------------------------------------
// Cookie harvest
// -----------------------------------------------------------------------------

async function harvestCookies(): Promise<Record<string, string>> {
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

  for (const domain of DIAG_COOKIE_DOMAINS) {
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

  // Merge the header-sourced jar. Header-sourced values win — they're the
  // ones the browser actually sends, and getAll can silently miss HttpOnly +
  // Partitioned cookies.
  for (const [name, value] of Object.entries(headerJar)) {
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
    dlog(
      `headerJar size=${Object.keys(headerJar).length} keys=[${Object.keys(headerJar).join(", ")}]`
    );
    dlog("merged harvest jar keys:", Object.keys(jar));
    for (const req of REQUIRED_COOKIES) {
      dlog(`required "${req}" → ${jar[req] ? truncVal(jar[req]) : "MISSING"}`);
    }
  }

  return jar;
}

// Retry harvesting: cookies set by a login redirect chain don't always land in
// Chrome's cookie store the instant the POST completes. Retry with backoff and
// stop as soon as the required cookies appear.
async function harvestCookiesWithRetry(): Promise<Record<string, string>> {
  const delays = [400, 800, 1500, 2500, 4000]; // total ~9.2s
  let last: Record<string, string> = {};
  for (let i = 0; i < delays.length; i++) {
    await new Promise((r) => setTimeout(r, delays[i]));
    dlog(`harvest attempt ${i + 1}/${delays.length} (after ${delays[i]}ms wait)`);
    last = await harvestCookies();
    if (hasRequiredCookies(last)) {
      dlog(`✔ required cookies present on attempt ${i + 1}`);
      return last;
    }
  }
  dlog("✘ required cookies never appeared after all retries");
  return last;
}

function hasRequiredCookies(jar: Record<string, string>): boolean {
  return REQUIRED_COOKIES.every((n) => !!jar[n]);
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
  const url = BACKEND_URL.replace(/\/+$/, "") + "/api/myntra/ingest-session";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.accessToken}`,
    },
    body: JSON.stringify({
      username: capture.username,
      jar: capture.cookies,
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

async function onLoginDetected(usernameHint: string | null): Promise<void> {
  const settings = await loadSettings();
  if (!settings.accessToken) {
    setStatus(
      "error",
      "Myntra login detected, but TrackVid isn't verified. Open the extension and click Verify."
    );
    notify(
      "Verification required",
      "TrackVid saw a Myntra login but is not verified. Click Verify in the popup."
    );
    return;
  }

  setStatus("capturing", `Detected login for ${usernameHint || "Myntra user"}`);
  dlog("onLoginDetected — usernameHint:", usernameHint);

  const jar = await harvestCookiesWithRetry();
  if (!hasRequiredCookies(jar)) {
    const seenNames = Object.keys(jar);
    const debugMsg =
      `Login detected but required cookies missing (${REQUIRED_COOKIES.join(", ")}). ` +
      `Saw ${seenNames.length} cookies: [${seenNames.slice(0, 12).join(", ")}${seenNames.length > 12 ? ", …" : ""}]`;
    dlog(debugMsg);
    setStatus("error", debugMsg);
    return;
  }

  const capture: CapturedSession = {
    username: usernameHint || inflightUsername || "(unknown)",
    userEmail: settings.userEmail || settings.userId || "(via token)",
    cookies: jar,
    capturedAt: new Date().toISOString(),
  };
  await saveLastCapture(capture);

  if (!settings.autoSync) {
    setStatus("success", "Captured — auto-sync disabled, re-sync manually.");
    return;
  }

  setStatus("syncing", "Uploading cookie jar to TrackVid…");
  try {
    await sendToBackend(capture, settings);
    capture.syncedAt = new Date().toISOString();
    await saveLastCapture(capture);
    setStatus("success", `Session synced for ${capture.username}`);
    notify(
      "TrackVid — session synced",
      `Myntra cookies for ${capture.username} were sent to the backend.`
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

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== "POST") return;
    const user = extractUsernameFromBody(details.requestBody || undefined);
    dlog(
      `onBeforeRequest matched: ${details.method} ${details.url} — usernameHint=${user ?? "(none)"}`
    );
    if (user) inflightUsername = user;
  },
  { urls: LOGIN_URL_PATTERNS },
  ["requestBody"]
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== "POST") return;
    dlog(
      `onCompleted matched: ${details.method} ${details.url} → status=${details.statusCode} type=${details.type}`
    );
    if (details.statusCode < 200 || details.statusCode >= 400) {
      dlog("  ignored — non-2xx/3xx");
      return;
    }
    const user = inflightUsername;
    inflightUsername = null;
    void onLoginDetected(user);
  },
  { urls: LOGIN_URL_PATTERNS }
);

// -----------------------------------------------------------------------------
// TEMPORARY diagnostic: log EVERY Myntra POST so we can see the login pattern.
// -----------------------------------------------------------------------------
chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (details.method !== "POST") return;
    dlog(`[all-POST] ${details.url} → ${details.statusCode}  type=${details.type}`);
  },
  { urls: ["https://*.myntra.com/*", "https://*.myntrainfo.com/*"] }
);

// -----------------------------------------------------------------------------
// Cookie capture via headers — the only way to see HttpOnly + Partitioned
// cookies in MV3. Both listeners require ["extraHeaders"] in the extraInfoSpec
// or Chrome strips Cookie / Set-Cookie for security. This is why the earlier
// getAll-only approach missed erp.at and session.
// -----------------------------------------------------------------------------

const MYNTRA_ALL_URLS = [
  "https://*.myntra.com/*",
  "https://*.myntrainfo.com/*",
];

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.responseHeaders) return;
    for (const h of details.responseHeaders) {
      if (h.name.toLowerCase() === "set-cookie" && h.value) {
        ingestSetCookieHeader(h.value, details.url);
      }
    }
  },
  { urls: MYNTRA_ALL_URLS },
  ["responseHeaders", "extraHeaders"]
);

chrome.webRequest.onSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;
    for (const h of details.requestHeaders) {
      if (h.name.toLowerCase() === "cookie" && h.value) {
        ingestCookieRequestHeader(h.value, details.url);
      }
    }
  },
  { urls: MYNTRA_ALL_URLS },
  ["requestHeaders", "extraHeaders"]
);

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
          setStatus("idle");
          sendResponse(await currentState());
          return;
        }
        case "HARVEST_NOW": {
          // TEMPORARY diagnostic hook. Call from the popup or service-worker
          // devtools console: chrome.runtime.sendMessage({type:"HARVEST_NOW"})
          dlog("HARVEST_NOW — forcing a fresh cookie scan");
          void onLoginDetected(null);
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
