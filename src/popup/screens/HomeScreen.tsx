import {
  ArrowRight,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { StatusIllustration } from "../components/StatusIllustration";
import { StatusChip } from "../components/StatusChip";
import { CredentialsList } from "../components/CredentialsList";
import { cn } from "@/lib/cn";
import type { BgState } from "@/lib/types";

interface HomeScreenProps {
  state: BgState;
  credentialsLoading: boolean;
  devMode: boolean;
  onOpenSettings: () => void;
  onVerify: () => void;
  onResync: () => void;
  onRefreshCredentials: () => void;
}

export function HomeScreen({
  state,
  credentialsLoading,
  devMode,
  onOpenSettings,
  onVerify,
  onResync,
  onRefreshCredentials,
}: HomeScreenProps) {
  const { status, lastCapture, lastMessage, verify, credentials } = state;
  const configured = verify === "verified";

  const heading = (() => {
    switch (status) {
      case "success":
        return "Session synced";
      case "capturing":
        return "Capturing cookies";
      case "syncing":
        return "Syncing to TrackVid";
      case "watching":
        return configured ? "Watching platform" : "Almost ready";
      case "error":
        return "Sync interrupted";
      default:
        return configured ? "Ready to capture" : "Set up capture";
    }
  })();

  const description = (() => {
    if (verify === "unverified") {
      return "Add your TrackVid credentials and click Verify to start capturing platform sessions.";
    }
    if (verify === "ready" || verify === "expired") {
      return "Credentials saved — click Verify to log in and start capturing.";
    }
    switch (status) {
      case "success":
        return `Cookies for ${lastCapture?.username ?? "the account"} were sent to TrackVid.`;
      case "capturing":
        return "A platform login just landed — reading cookies from Chrome…";
      case "syncing":
        return "Uploading the cookie jar to your backend.";
      case "error":
        return lastMessage || "The last sync attempt failed. You can retry manually below.";
      case "watching":
      case "idle":
      default:
        return "Log in to the platform in this browser. We'll grab the session cookies the moment login succeeds.";
    }
  })();

  // Left button (verify status). Clickable only when verify === "ready" or "expired".
  const verifyClickable = verify === "ready" || verify === "expired";
  const verifyLabel =
    verify === "verified"
      ? "Verified"
      : verify === "verifying"
        ? "Verifying…"
        : verify === "unverified"
          ? "Unverified"
          : "Verify";
  const VerifyIcon =
    verify === "verified" ? ShieldCheck : verify === "unverified" ? ShieldOff : ShieldAlert;
  const verifyBtnClass =
    verify === "verified"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default"
      : verify === "unverified"
        ? "border-ink-300/50 bg-ink-300/10 text-ink-400 cursor-not-allowed"
        : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100";

  return (
    <div className="animate-fade-in flex h-full flex-col">
      <div className="px-5">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50/70 to-white p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Session bridge
            </span>
            <StatusChip status={configured ? status : "idle"} />
          </div>
          <StatusIllustration status={configured ? status : "idle"} />
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col px-5">
        <h2 className="text-center text-[15px] font-bold tracking-tight text-ink-900">
          {heading}
        </h2>
        <p className="mx-auto mt-1 max-w-[300px] text-center text-[12px] leading-snug text-ink-500">
          {description}
        </p>

        {configured && devMode && (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <CredentialsList
              data={credentials}
              loading={credentialsLoading}
              onRefresh={onRefreshCredentials}
            />
          </div>
        )}

        <div className={cn("pb-4 pt-3", (!configured || !devMode) && "mt-auto")}>
          <div className="grid grid-cols-2 gap-2">
            {/* Left: verify status / verify button */}
            <button
              type="button"
              onClick={verifyClickable ? onVerify : undefined}
              disabled={!verifyClickable}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                verifyBtnClass
              )}
            >
              <VerifyIcon className="h-4 w-4" />
              {verifyLabel}
            </button>

            {/* Right: primary action — setup / resync */}
            {verify !== "verified" ? (
              <button className="btn-primary" onClick={onOpenSettings}>
                <ShieldCheck className="h-4 w-4" />
                {verify === "unverified" ? "Complete setup" : "Configure"}
                <ArrowRight className="ml-1 h-4 w-4" />
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={onResync}
                disabled={!lastCapture || status === "syncing"}
              >
                <RefreshCw className="h-4 w-4" />
                {status === "syncing" ? "Syncing…" : "Re-sync"}
              </button>
            )}
          </div>

          {verify === "verified" && (
            <button className="btn-ghost mt-2" onClick={onOpenSettings}>
              Configure account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
