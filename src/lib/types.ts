export type SessionStatus =
  | "idle"
  | "watching"
  | "capturing"
  | "syncing"
  | "success"
  | "error";

export type VerifyStatus =
  | "unverified"  // no credentials saved yet
  | "ready"      // credentials saved, no token — Verify button clickable
  | "verifying"  // login request in flight
  | "verified"   // token stored
  | "expired";   // token cleared after a 401

// Which seller portal a capture came from. Older stored captures predate the
// field, so readers treat a missing value as Myntra.
//
// Delhivery + Xbees use JWT bearer tokens instead of cookies — the extension
// captures the token bundle from the response body of the Keycloak /token
// endpoint and posts it as { username, accessToken, refreshToken, expiresIn,
// realm, ... } to the BE, NOT as a cookie jar.
export type CapturedPlatform =
  | "myntra"
  | "flipkart"
  | "ajio"
  | "snapdeal"
  | "delhivery"
  | "xbees"
  | "meesho"
  | "nykaa";

// Full cookie record — needed for AJIO because Akamai's HttpOnly cookies
// cannot be rehydrated into Puppeteer via CDP without the domain/path/secure/
// httpOnly/sameSite/expires shape. Myntra and Flipkart send a flat map (their
// automation uses axios with a manual Cookie header, so name+value is enough).
export interface AjioCookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
  expires?: number;
}

export interface CapturedSession {
  platform?: CapturedPlatform;
  username: string;
  userEmail: string;
  // Myntra/Flipkart/Snapdeal: flat {name: value}. AJIO: full cookie records; the
  // AJIO branch of sendToBackend keeps this shape when it POSTs.
  // Delhivery/Xbees: cookies is empty; the session is expressed as JWT tokens
  // below (accessToken/refreshToken/etc.) — cookie-jar platforms and JWT
  // platforms both flow through this interface for uniformity.
  cookies: {
    "erp.at"?: string;
    session?: string;
    [key: string]: string | undefined;
  };
  // AJIO only: full cookie records with domain/path/secure/httpOnly. Used by
  // the AJIO ingest endpoint which rehydrates them into Puppeteer via CDP.
  ajioCookies?: AjioCookieRecord[];
  // Flipkart only: the fk-csrf-token that signs its API calls. Not a cookie,
  // so it is stored beside the jar rather than inside it.
  csrfToken?: string;
  // AJIO only: post-login SPA state read by the content script. The runner
  // uses these on reuse to skip getUserId() and getPobIds().
  ajioUserId?: string;
  ajioPobIds?: string[];
  ajioStores?: { id: string; storeName?: string }[];
  // Delhivery/Xbees only: OAuth2 tokens captured from the Keycloak /token
  // response body. The BE stores `refreshToken` and mints a fresh
  // `accessToken` each batch (see per-platform sessionStore.js).
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;             // seconds, from token endpoint `expires_in`
  idToken?: string | null;
  tokenType?: string;             // "Bearer"
  realm?: string;                 // Keycloak realm slug
  capturedAt: string;
  syncedAt?: string;
  error?: string;
}

export interface Settings {
  // Toggle: when true, use userId (impersonation login via the existing
  // system-admin endpoint). When false, use email+password.
  useUserId: boolean;
  userId: string;
  userEmail: string;
  password: string;
  savePassword: boolean;
  // Managed by the extension: filled by POST /api/auth/login or
  // GET /api/system-admin/:id.
  accessToken: string;
  tokenSavedAt: string;
  autoSync: boolean;
}

export type BgMessage =
  | { type: "GET_STATE" }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "VERIFY_LOGIN" }
  | { type: "LOGOUT" }
  | { type: "RESYNC_LAST" }
  | { type: "CLEAR_LAST" }
  | { type: "LIST_CREDENTIALS"; force?: boolean };

// Session summary returned by GET /api/cms/my-company-credentials. Mirrors
// the projection in TrackVid-BE companyCredentials.controller.ts — cookie
// VALUES and csrfToken are stripped in-DB, only names / presence bits leave.
export interface SessionSummary {
  savedAt: string | null;
  expiresAt: string | null;
  ip: string | null;
  source: string | null;
  cookieNames: string[];
  // Myntra rows carry hasProxySession; Flipkart rows carry hasCsrfToken;
  // AJIO rows carry userId + pobCount (both non-secret post-login state).
  hasProxySession?: boolean;
  hasCsrfToken?: boolean;
  userId?: string | null;
  pobCount?: number;
}

export interface PlatformCredential {
  credentialId: string;
  username: string;
  accountType: string;
  vendorCode: string;
  isVerified: boolean;
  visible: boolean;
  // Only the field for this credential's own platform is populated; the
  // others are always null.
  myntraSession: SessionSummary | null;
  flipkartSession: SessionSummary | null;
  ajioSession: SessionSummary | null;
  snapdealSession: SessionSummary | null;
  delhiverySession: SessionSummary | null;
  xbeesSession: SessionSummary | null;
  meeshoSession: SessionSummary | null;
  nykaaSession: SessionSummary | null;
}

export interface CredentialsList {
  myntra: PlatformCredential[];
  flipkart: PlatformCredential[];
  ajio: PlatformCredential[];
  snapdeal: PlatformCredential[];
  delhivery: PlatformCredential[];
  xbees: PlatformCredential[];
  meesho: PlatformCredential[];
  nykaa: PlatformCredential[];
  // ms epoch of the fetch; the popup shows "updated Xs ago" and decides
  // whether to trigger a background refresh.
  fetchedAt: number;
  error: string | null;
}

export interface BgState {
  settings: Settings;
  status: SessionStatus;
  verify: VerifyStatus;
  verifyMessage: string | null;
  lastCapture: CapturedSession | null;
  lastMessage: string | null;
  credentials: CredentialsList | null;
}
