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
  | { type: "CLEAR_LAST" };

export interface BgState {
  settings: Settings;
  status: SessionStatus;
  verify: VerifyStatus;
  verifyMessage: string | null;
  lastCapture: CapturedSession | null;
  lastMessage: string | null;
}
