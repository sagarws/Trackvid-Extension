// Store-listing screenshot harness. Renders the real popup screens against
// fixed mock state so the frames are reproducible. Not part of the extension
// build — served only by `vite dev` at /screenshots/demo.html?frame=N.
import { createRoot } from "react-dom/client";
import "@/popup/index.css";
import { Header } from "@/popup/components/Header";
import { HomeScreen } from "@/popup/screens/HomeScreen";
import { SettingsScreen } from "@/popup/screens/SettingsScreen";
import type { BgState, Settings } from "@/lib/types";

const settings: Settings = {
  useUserId: false,
  userId: "",
  userEmail: "ops@northlight-retail.in",
  password: "••••••••••••",
  savePassword: true,
  accessToken: "",
  tokenSavedAt: "",
  autoSync: true,
};

const base: BgState = {
  settings,
  status: "idle",
  verify: "unverified",
  verifyMessage: null,
  lastCapture: null,
  lastMessage: null,
  credentials: null,
};

const capture = {
  platform: "myntra" as const,
  username: "northlight-retail",
  userEmail: "ops@northlight-retail.in",
  cookies: {},
  capturedAt: new Date("2026-08-20T09:12:00Z").toISOString(),
  syncedAt: new Date("2026-08-20T09:12:03Z").toISOString(),
};

const FRAMES: Record<string, BgState> = {
  "1": base,
  "2": { ...base, verify: "ready" },
  "3": { ...base, verify: "verified", status: "watching" },
  "4": { ...base, verify: "verified", status: "success", lastCapture: capture },
};

const frame = new URLSearchParams(location.search).get("frame") ?? "1";
const isSettings = frame === "2";
const state = FRAMES[frame] ?? base;
const noop = () => {};

createRoot(document.getElementById("root")!).render(
  <div className="relative flex h-[710px] w-full flex-col bg-white">
    <Header onOpenSettings={noop} />
    <div className="h-px bg-gradient-to-r from-transparent via-ink-300/40 to-transparent" />
    <div className="flex-1 overflow-hidden">
      {isSettings ? (
        <SettingsScreen
          initial={state.settings}
          verify={state.verify}
          verifyMessage={null}
          devMode={false}
          onSave={noop}
          onVerify={noop}
          onLogout={noop}
          onBack={noop}
        />
      ) : (
        <HomeScreen
          state={state}
          credentialsLoading={false}
          devMode={false}
          onOpenSettings={noop}
          onVerify={noop}
          onResync={noop}
          onRefreshCredentials={noop}
        />
      )}
    </div>
  </div>
);
