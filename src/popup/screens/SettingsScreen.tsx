import { ArrowLeft, LogOut, Save, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { Settings, VerifyStatus } from "@/lib/types";

interface Props {
  initial: Settings;
  verify: VerifyStatus;
  verifyMessage: string | null;
  onSave: (s: Settings) => Promise<void> | void;
  onVerify: () => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onBack: () => void;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SettingsScreen({
  initial,
  verify,
  verifyMessage,
  onSave,
  onVerify,
  onLogout,
  onBack,
}: Props) {
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const credentialsValid = form.useUserId
    ? OBJECT_ID.test((form.userId ?? "").trim())
    : EMAIL_RE.test((form.userEmail ?? "").trim().toLowerCase()) &&
      (form.password ?? "").length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } finally {
      setSaving(false);
    }
  };

  const doVerify = async () => {
    // Persist first so the bg has the latest form values before it logs in.
    await onSave(form);
    setVerifying(true);
    try {
      await onVerify();
    } finally {
      setVerifying(false);
    }
  };

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
      // Mirror the bg's cleanup in local form state so the UI reflects it
      // immediately (STATE_UPDATE also arrives, but this avoids a flicker).
      setForm((prev) => ({ ...prev, password: "", accessToken: "", tokenSavedAt: "" }));
    } finally {
      setLoggingOut(false);
    }
  };

  const verifyPillClass =
    verify === "verified"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : verify === "ready"
        ? "bg-brand-100 text-brand-700 border-brand-200"
        : "bg-ink-300/20 text-ink-500 border-ink-300/40";
  const verifyPillLabel =
    verify === "verified"
      ? "Verified"
      : verify === "ready"
        ? "Ready"
        : verify === "verifying"
          ? "Verifying…"
          : "Unverified";

  return (
    <form onSubmit={submit} className="animate-fade-in flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-300/60 bg-white text-ink-500 transition hover:border-brand-400 hover:text-brand-600"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[15px] font-bold text-ink-900">Configuration</h2>
        </div>

        {/* Toggle: "Have User ID" — impersonation shortcut */}
        <label className="flex cursor-pointer items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Have User ID
          </span>
          <span className="relative inline-flex h-5 w-9 items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.useUserId}
              onChange={(e) => set("useUserId", e.target.checked)}
            />
            <span className="absolute inset-0 rounded-full bg-ink-300/60 transition peer-checked:bg-brand-500" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-2">
        {form.useUserId ? (
          <div>
            <label className="field-label" htmlFor="userId">
              User ID
            </label>
            <input
              id="userId"
              className="input font-mono"
              placeholder="e.g. 64a1f8b2c9e12d0012ab34cd"
              value={form.userId ?? ""}
              onChange={(e) => set("userId", e.target.value.trim())}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1 text-[11px] text-ink-400">
              Impersonation login: the extension trades this Mongo user ID for
              an access token without a password. Only use on trusted machines.
            </p>
          </div>
        ) : (
          <>
            <div>
              <label className="field-label" htmlFor="userEmail">
                User Email
              </label>
              <input
                id="userEmail"
                type="email"
                className="input"
                placeholder="you@company.com"
                value={form.userEmail ?? ""}
                onChange={(e) =>
                  set("userEmail", e.target.value.trim().toLowerCase())
                }
                autoComplete="email"
                spellCheck={false}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="Your TrackVid password"
                value={form.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                autoComplete="current-password"
              />
              <label className="mt-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 cursor-pointer accent-brand-600"
                  checked={form.savePassword}
                  onChange={(e) => set("savePassword", e.target.checked)}
                />
                <span className="text-[11px] text-ink-500">
                  Save password on this device (needed to re-verify automatically
                  when the token expires)
                </span>
              </label>
            </div>
          </>
        )}

        <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-xl border border-ink-300/50 bg-white p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer accent-brand-600"
            checked={form.autoSync}
            onChange={(e) => set("autoSync", e.target.checked)}
          />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-ink-900">
              Auto-sync on capture
            </span>
            <span className="block text-[11px] leading-snug text-ink-500">
              Send the cookie jar to your backend the instant login succeeds.
              Uncheck to hold captures for manual review.
            </span>
          </span>
        </label>

        {/* Verify status + message */}
        <div className="rounded-xl border border-ink-300/50 bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              Verification
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                verifyPillClass
              )}
            >
              {verifyPillLabel}
            </span>
          </div>
          {verifyMessage && (
            <p className="mt-2 break-words text-[11px] text-ink-500">
              {verifyMessage}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 px-5 pb-4 pt-2">
        <button
          type="button"
          className="btn-primary"
          onClick={doVerify}
          disabled={!credentialsValid || verifying}
        >
          <ShieldCheck className="h-4 w-4" />
          {verifying ? "Verifying…" : "Verify login"}
        </button>
        <button
          type="submit"
          className="btn-ghost"
          disabled={saving}
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </button>
        {verify === "verified" && (
          <button
            type="button"
            onClick={doLogout}
            disabled={loggingOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        )}
      </div>
    </form>
  );
}
