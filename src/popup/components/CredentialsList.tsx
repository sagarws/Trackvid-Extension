import { useMemo, useState } from "react";
import { Copy, Eye, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type {
  CredentialsList as CredentialsListT,
  PlatformCredential,
  SessionSummary,
} from "@/lib/types";

interface Props {
  data: CredentialsListT | null;
  loading: boolean;
  onRefresh: () => void;
}

type PlatformKey = "myntra" | "flipkart" | "ajio";
type SessionStateKind = "active" | "expired" | "none";

interface SessionState {
  kind: SessionStateKind;
  label: string;
  className: string;
  expiresInMs: number | null;
}

// One row's session state. Splits three-way so the chip class + label can
// come from a single lookup — the table renders a lot of rows on Enterprise
// tenants and this keeps per-row JSX small.
function readSessionState(session: SessionSummary | null): SessionState {
  if (!session || !session.expiresAt) {
    return {
      kind: "none",
      label: "No session",
      className: "bg-ink-300/40 text-ink-600",
      expiresInMs: null,
    };
  }
  const expires = new Date(session.expiresAt).getTime();
  const remaining = expires - Date.now();
  if (remaining <= 0) {
    return {
      kind: "expired",
      label: "Expired",
      className: "bg-rose-100 text-rose-700",
      expiresInMs: remaining,
    };
  }
  return {
    kind: "active",
    label: "Active",
    className: "bg-emerald-100 text-emerald-700",
    expiresInMs: remaining,
  };
}

// Short "in 12h 34m" / "3d 2h" formatter. Long-form ISO timestamps are shown
// in the detail modal, but the table row needs a glanceable label.
function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CredentialsList({ data, loading, onRefresh }: Props) {
  const [viewing, setViewing] = useState<{
    platform: PlatformKey;
    cred: PlatformCredential;
  } | null>(null);

  const sections = useMemo(() => {
    const src = data ?? { myntra: [], flipkart: [], ajio: [] };
    return [
      { key: "myntra" as const, label: "Myntra", rows: src.myntra },
      { key: "flipkart" as const, label: "Flipkart", rows: src.flipkart },
      { key: "ajio" as const, label: "AJIO", rows: src.ajio },
    ];
  }, [data]);

  const total =
    (data?.myntra.length ?? 0) + (data?.flipkart.length ?? 0) + (data?.ajio.length ?? 0);
  const fetchedAgo = data?.fetchedAt
    ? formatRelative(Date.now() - data.fetchedAt)
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
          Accounts {total > 0 && <span className="text-ink-400">({total})</span>}
        </span>
        <div className="flex items-center gap-2">
          {fetchedAgo && (
            <span className="text-[10px] text-ink-400">updated {fetchedAgo}</span>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-md p-1 text-ink-500 transition hover:bg-ink-300/30 hover:text-ink-900 disabled:opacity-50"
            aria-label="Refresh accounts"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {data?.error && (
        <p className="mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
          {data.error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-ink-300/40 bg-white">
        {loading && !data ? (
          <p className="px-3 py-6 text-center text-[11px] text-ink-400">
            Loading accounts…
          </p>
        ) : total === 0 ? (
          <p className="px-3 py-6 text-center text-[11px] text-ink-400">
            {data?.error
              ? "Couldn't load accounts."
              : "No accounts configured for this company yet."}
          </p>
        ) : (
          sections
            .filter((s) => s.rows.length > 0)
            .map((section) => (
              <div key={section.key}>
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-300/30 bg-ink-100/60 px-3 py-1.5 backdrop-blur">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-700">
                    {section.label}
                  </span>
                  <span className="text-[10px] text-ink-500">
                    {section.rows.length}
                  </span>
                </div>
                <ul>
                  {section.rows.map((cred) => (
                    <CredentialRow
                      key={cred.credentialId}
                      cred={cred}
                      platform={section.key}
                      onView={() =>
                        setViewing({ platform: section.key, cred })
                      }
                    />
                  ))}
                </ul>
              </div>
            ))
        )}
      </div>

      {viewing && (
        <SessionDetailModal
          platform={viewing.platform}
          cred={viewing.cred}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  cred: PlatformCredential;
  platform: PlatformKey;
  onView: () => void;
}

function CredentialRow({ cred, platform, onView }: RowProps) {
  const session =
    platform === "myntra"
      ? cred.myntraSession
      : platform === "flipkart"
        ? cred.flipkartSession
        : cred.ajioSession;
  const state = readSessionState(session);
  return (
    <li className="flex items-center gap-2 border-b border-ink-300/20 px-3 py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[12px] font-semibold text-ink-900"
          title={cred.username}
        >
          {cred.username || "(no username)"}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide",
              cred.isVerified
                ? "bg-emerald-100 text-emerald-700"
                : "bg-ink-300/40 text-ink-600"
            )}
          >
            {cred.isVerified ? "Verified" : "Unverified"}
          </span>
          {state.kind === "active" && state.expiresInMs != null && (
            <span className="text-[9px] text-ink-400">
              expires in {formatDuration(state.expiresInMs)}
            </span>
          )}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          state.className
        )}
      >
        {state.label}
      </span>
      <button
        type="button"
        onClick={onView}
        className="rounded-md p-1 text-ink-500 transition hover:bg-ink-300/30 hover:text-ink-900"
        aria-label={`View ${cred.username} session`}
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

interface ModalProps {
  platform: PlatformKey;
  cred: PlatformCredential;
  onClose: () => void;
}

function SessionDetailModal({ platform, cred, onClose }: ModalProps) {
  const [copied, setCopied] = useState(false);
  const session =
    platform === "myntra"
      ? cred.myntraSession
      : platform === "flipkart"
        ? cred.flipkartSession
        : cred.ajioSession;
  const state = readSessionState(session);

  // Exact shape shown on the dashboard's detail modal (see Image #2). Nulls
  // are preserved so operators can see whether a field is actually missing
  // vs. just visually absent.
  const payload = useMemo(
    () =>
      session
        ? {
            savedAt: session.savedAt,
            expiresAt: session.expiresAt,
            ip: session.ip,
            source: session.source,
            ...(platform === "flipkart"
              ? { hasCsrfToken: session.hasCsrfToken ?? false }
              : platform === "ajio"
                ? { userId: session.userId ?? null, pobCount: session.pobCount ?? 0 }
                : { hasProxySession: session.hasProxySession ?? false }),
            cookieNames: session.cookieNames,
          }
        : null,
    [session, platform]
  );

  const jsonText = payload
    ? JSON.stringify(payload, null, 2)
    : "// no session captured for this account";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be denied in some contexts — no-op */
    }
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92%] w-full flex-col rounded-t-2xl bg-ink-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              {platform === "myntra" ? "Myntra" : platform === "flipkart" ? "Flipkart" : "AJIO"} session
            </p>
            <p
              className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-white/70"
              title={cred.username}
            >
              <span className="truncate">{cred.username}</span>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase",
                  state.className
                )}
              >
                {state.label}
              </span>
              {state.kind === "active" && state.expiresInMs != null && (
                <span className="text-white/60">
                  expires in {formatDuration(state.expiresInMs)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <pre className="flex-1 overflow-auto whitespace-pre px-4 py-3 font-mono text-[10.5px] leading-relaxed text-white/90">
          {jsonText}
        </pre>

        <div className="border-t border-white/10 px-4 py-2.5">
          <p className="mb-2 text-[10px] leading-snug text-white/50">
            Cookie values never reach this popup — <code>jar</code> is reported
            as <code>cookieNames</code>
            {platform === "flipkart"
              ? ", and the fk-csrf-token only as `hasCsrfToken`."
              : platform === "ajio"
                ? ". userId + pobCount are safe post-login state."
                : "."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white transition hover:bg-white/10"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy JSON"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-brand-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}
