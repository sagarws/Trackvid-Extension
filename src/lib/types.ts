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
export type CapturedPlatform = "myntra" | "flipkart";

export interface CapturedSession {
  platform?: CapturedPlatform;
  username: string;
  userEmail: string;
  cookies: {
    "erp.at"?: string;
    session?: string;
    [key: string]: string | undefined;
  };
  // Flipkart only: the fk-csrf-token that signs its API calls. Not a cookie,
  // so it is stored beside the jar rather than inside it.
  csrfToken?: string;
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
  // Myntra rows carry hasProxySession; Flipkart rows carry hasCsrfToken.
  hasProxySession?: boolean;
  hasCsrfToken?: boolean;
}

export interface PlatformCredential {
  credentialId: string;
  username: string;
  accountType: string;
  vendorCode: string;
  isVerified: boolean;
  visible: boolean;
  // Only the field for this credential's own platform is populated; the
  // other is always null.
  myntraSession: SessionSummary | null;
  flipkartSession: SessionSummary | null;
}

export interface CredentialsList {
  myntra: PlatformCredential[];
  flipkart: PlatformCredential[];
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
