import { useEffect, useRef, useState } from "react";
import { Header } from "./components/Header";
import { Toast } from "./components/Toast";
import { SplashScreen } from "./screens/SplashScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import type { BgState, Settings } from "@/lib/types";

const DEFAULT_STATE: BgState = {
  settings: {
    useUserId: false,
    userId: "",
    userEmail: "",
    password: "",
    savePassword: false,
    accessToken: "",
    tokenSavedAt: "",
    autoSync: true,
  },
  status: "idle",
  verify: "unverified",
  verifyMessage: null,
  lastCapture: null,
  lastMessage: null,
  credentials: null,
};

async function requestBg<T = unknown>(msg: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(res as T);
      });
    } catch (err) {
      reject(err);
    }
  });
}

type Screen = "home" | "settings";
type ToastState = { kind: "error" | "success"; text: string } | null;

const TOAST_TTL_MS = 5000;

export function App() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState<Screen>("home");
  const [state, setState] = useState<BgState>(DEFAULT_STATE);
  const [toast, setToast] = useState<ToastState>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);

  // Track the last bg error we've already surfaced so the effect that mirrors
  // spontaneous bg failures (auto-sync fails, token 401s, etc.) doesn't
  // re-fire the toast on every unrelated STATE_UPDATE.
  const lastShownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const start = Date.now();

    async function boot() {
      try {
        const s = await requestBg<BgState>({ type: "GET_STATE" });
        if (mounted && s) {
          setState(s);
          // Any error that was already latched in the bg before the popup
          // opened has been seen — don't fire a toast for it.
          if (s.status === "error" && s.lastMessage) {
            lastShownErrorRef.current = s.lastMessage;
          }
          // Auto-fetch credentials once verified — nothing to list otherwise.
          if (s.verify === "verified") {
            setCredentialsLoading(true);
            requestBg<BgState>({ type: "LIST_CREDENTIALS" })
              .then((next) => {
                if (mounted && next) setState(next);
              })
              .catch(() => {
                /* SW will report the error via credentials.error */
              })
              .finally(() => {
                if (mounted) setCredentialsLoading(false);
              });
          }
        }
      } catch {
        /* keep defaults — worker may still be waking up */
      }
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 900 - elapsed);
      setTimeout(() => mounted && setBooting(false), remaining);
    }
    boot();

    const listener = (msg: { type?: string; state?: BgState }) => {
      if (msg?.type === "STATE_UPDATE" && msg.state) setState(msg.state);
    };
    chrome.runtime?.onMessage?.addListener(listener);
    return () => {
      mounted = false;
      chrome.runtime?.onMessage?.removeListener(listener);
    };
  }, []);

  // Auto-dismiss the toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_TTL_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // Surface spontaneous bg errors (e.g., an auto-sync failed after a Myntra
  // login while the popup happened to be open). Fires only when the message
  // actually changes so quiet re-renders don't keep re-toasting.
  useEffect(() => {
    if (state.status === "error" && state.lastMessage) {
      if (state.lastMessage !== lastShownErrorRef.current) {
        setToast({ kind: "error", text: state.lastMessage });
        lastShownErrorRef.current = state.lastMessage;
      }
    } else {
      lastShownErrorRef.current = null;
    }
  }, [state.status, state.lastMessage]);

  // Refresh credentials when a spontaneous sync lands (auto-capture that
  // completes while the popup is open). Debounced by lastCapture.syncedAt
  // so the fetch only runs on a fresh sync, not on every state update.
  const lastSyncedAtRef = useRef<string | null>(null);
  useEffect(() => {
    const syncedAt = state.lastCapture?.syncedAt ?? null;
    if (syncedAt && syncedAt !== lastSyncedAtRef.current) {
      lastSyncedAtRef.current = syncedAt;
      if (state.verify === "verified") refreshCredentials();
    }
  }, [state.lastCapture?.syncedAt, state.verify]);

  const saveSettings = async (settings: Settings) => {
    const next = await requestBg<BgState>({ type: "SAVE_SETTINGS", settings });
    if (next) setState(next);
    // Don't auto-navigate here — the caller decides (Verify goes home on
    // success, plain Save stays put so the user can keep editing).
  };

  const verifyLogin = async () => {
    const next = await requestBg<BgState>({ type: "VERIFY_LOGIN" });
    if (!next) return;
    setState(next);
    if (next.verify === "verified") {
      setToast({ kind: "success", text: "Verified — ready to capture." });
      setScreen("home");
      // First-time verify — pull the account list right away so the newly
      // rendered HomeScreen isn't empty on the initial paint.
      refreshCredentials();
    } else if (next.verifyMessage && !/^verifying/i.test(next.verifyMessage)) {
      setToast({ kind: "error", text: next.verifyMessage });
      // Mark this as seen so the mirror effect above doesn't fire a duplicate
      // when the same message shows up on next.lastMessage.
      lastShownErrorRef.current = next.verifyMessage;
    }
  };

  const logout = async () => {
    const next = await requestBg<BgState>({ type: "LOGOUT" });
    if (!next) return;
    setState(next);
    setToast({ kind: "success", text: "Logged out." });
    setScreen("home");
  };

  const resync = async () => {
    const next = await requestBg<BgState>({ type: "RESYNC_LAST" });
    if (!next) return;
    setState(next);
    if (next.status === "success") {
      setToast({ kind: "success", text: "Re-synced." });
      // Session row for that account is now stale — pull a fresh list.
      refreshCredentials();
    }
  };

  const refreshCredentials = async () => {
    setCredentialsLoading(true);
    try {
      const next = await requestBg<BgState>({
        type: "LIST_CREDENTIALS",
        force: true,
      });
      if (next) setState(next);
    } catch {
      /* error surfaces on state.credentials.error */
    } finally {
      setCredentialsLoading(false);
    }
  };

  if (booting) return <SplashScreen />;

  return (
    <div className="relative flex h-[710px] w-full flex-col bg-white">
      {toast && (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onClose={() => setToast(null)}
        />
      )}
      <Header
        onOpenSettings={() =>
          setScreen((s) => (s === "settings" ? "home" : "settings"))
        }
      />
      <div className="h-px bg-gradient-to-r from-transparent via-ink-300/40 to-transparent" />
      <div className="flex-1 overflow-hidden">
        {screen === "home" ? (
          <HomeScreen
            state={state}
            credentialsLoading={credentialsLoading}
            onOpenSettings={() => setScreen("settings")}
            onVerify={verifyLogin}
            onResync={resync}
            onRefreshCredentials={refreshCredentials}
          />
        ) : (
          <SettingsScreen
            initial={state.settings}
            verify={state.verify}
            verifyMessage={state.verifyMessage}
            onSave={saveSettings}
            onVerify={verifyLogin}
            onLogout={logout}
            onBack={() => setScreen("home")}
          />
        )}
      </div>
    </div>
  );
}
