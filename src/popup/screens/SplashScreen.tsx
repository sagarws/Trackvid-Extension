import { BrandMark } from "../components/BrandMark";

export function SplashScreen() {
  return (
    <div className="relative flex h-[560px] w-full flex-col overflow-hidden bg-white">
      {/* Top pattern header — soft indigo dot grid on a rounded card */}
      <div className="relative">
        <div className="mx-3 mt-3 h-44 overflow-hidden rounded-b-[36px] rounded-t-2xl bg-gradient-to-b from-brand-100 via-brand-50 to-white">
          <div className="dot-grid absolute inset-0 opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="pointer-events-none absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand-300/40 blur-3xl" />
        </div>
      </div>

      {/* Logo lifted out of the header */}
      <div className="relative -mt-16 flex flex-col items-center px-8">
        <div className="relative">
          <span className="absolute inset-0 -z-10 animate-pulse-ring rounded-3xl bg-brand-400/40" />
          <BrandMark size={104} withGlow />
        </div>

        <h1 className="mt-8 text-2xl font-extrabold tracking-tight text-brand-600">
          TrackVid
        </h1>
      </div>

      {/* Animated loader card */}
      <div className="mt-10 flex flex-1 items-start justify-center px-8">
        <div className="w-full rounded-2xl border border-brand-100 bg-white p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
            <span className="text-ink-400">Initializing</span>
            <span className="text-brand-600">Please wait</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-brand-100/60">
            <div className="absolute inset-y-0 w-1/4 animate-progress-slide rounded-full bg-gradient-to-r from-brand-500 to-brand-700" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Loading service worker…
          </div>
        </div>
      </div>

      {/* Bottom brand accent bar */}
      <div className="mt-auto">
        <div className="mx-4 mb-4 h-1 rounded-full bg-gradient-to-r from-brand-400 via-brand-600 to-brand-800" />
        <p className="pb-4 text-center text-[11px] font-medium text-ink-400">
          v0.1 · TrackVid Automation
        </p>
      </div>
    </div>
  );
}
