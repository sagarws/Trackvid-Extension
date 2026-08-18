import { cn } from "@/lib/cn";
import type { SessionStatus } from "@/lib/types";

const MAP: Record<
  SessionStatus,
  { label: string; className: string; dotClassName: string }
> = {
  idle: {
    label: "Idle",
    className: "bg-ink-300/30 text-ink-500",
    dotClassName: "bg-ink-400",
  },
  watching: {
    label: "Watching",
    className: "bg-brand-100 text-brand-700",
    dotClassName: "bg-brand-500 animate-pulse",
  },
  capturing: {
    label: "Capturing",
    className: "bg-amber-100 text-amber-800",
    dotClassName: "bg-amber-500 animate-pulse",
  },
  syncing: {
    label: "Syncing",
    className: "bg-brand-100 text-brand-700",
    dotClassName: "bg-brand-500 animate-pulse",
  },
  success: {
    label: "Synced",
    className: "bg-emerald-100 text-emerald-700",
    dotClassName: "bg-emerald-500",
  },
  error: {
    label: "Error",
    className: "bg-rose-100 text-rose-700",
    dotClassName: "bg-rose-500",
  },
};

export function StatusChip({ status }: { status: SessionStatus }) {
  const s = MAP[status];
  return (
    <span className={cn("status-chip", s.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dotClassName)} />
      {s.label}
    </span>
  );
}
