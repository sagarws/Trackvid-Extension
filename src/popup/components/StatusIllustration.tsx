import { cn } from "@/lib/cn";
import type { SessionStatus } from "@/lib/types";

interface Props {
  status: SessionStatus;
}

/**
 * Compact hero illustration for the current status.
 * Mirrors the plug/socket vibe of the reference but stays platform-neutral:
 * a browser card ⇢ a shield vault, with a live "link" that changes state.
 */
export function StatusIllustration({ status }: Props) {
  const linkColor =
    status === "success"
      ? "text-emerald-500"
      : status === "error"
        ? "text-rose-500"
        : status === "capturing" || status === "syncing"
          ? "text-brand-500"
          : status === "watching"
            ? "text-brand-400"
            : "text-ink-300";

  const isActive = status !== "idle" && status !== "error";

  return (
    <div className="relative mx-auto flex h-36 w-full items-center justify-center px-6">
      {/* Left: browser card */}
      <div className="relative flex h-24 w-24 flex-col items-stretch overflow-hidden rounded-2xl border border-ink-300/50 bg-white shadow-soft">
        <div className="flex items-center gap-1 border-b border-ink-300/40 bg-ink-900/[0.03] px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <div className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            Platform
          </div>
          <div className="h-1 w-10 rounded bg-ink-300/70" />
          <div className="h-1 w-8 rounded bg-ink-300/50" />
        </div>
      </div>

      {/* Middle: animated link */}
      <div className={cn("relative mx-2 flex items-center", linkColor)}>
        <span className="block h-0.5 w-4 rounded-full bg-current" />
        <span className="relative mx-1 block h-2.5 w-2.5 rounded-full bg-current">
          {isActive && (
            <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60" />
          )}
        </span>
        <span className="block h-0.5 w-4 rounded-full bg-current" />
      </div>

      {/* Right: TrackVid vault */}
      <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-card">
        <svg viewBox="0 0 64 64" className="h-12 w-12">
          <path
            d="M32 5 L56 13 V30 C56 44 45 54 32 58 C19 54 8 44 8 30 V13 Z"
            fill="rgba(255,255,255,0.18)"
          />
          <path
            d="M32 11 L50 17 V30 C50 41 41 49 32 52 C23 49 14 41 14 30 V17 Z"
            fill="rgba(255,255,255,0.28)"
          />
          <path
            d="M22 33 L29 40 L44 24"
            stroke="white"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        {isActive && (
          <span className="absolute inset-0 animate-pulse-ring rounded-2xl bg-brand-400/40" />
        )}
      </div>
    </div>
  );
}
