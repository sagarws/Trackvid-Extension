import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ToastProps {
  kind: "error" | "success";
  text: string;
  onClose: () => void;
}

export function Toast({ kind, text, onClose }: ToastProps) {
  const isError = kind === "error";
  const Icon = isError ? AlertTriangle : CheckCircle2;
  return (
    <div
      role="alert"
      className={cn(
        "animate-slide-down flex items-start gap-2 border-b px-4 py-2.5 shadow-sm",
        isError
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          isError ? "text-rose-600" : "text-emerald-600"
        )}
      />
      <div className="flex-1 break-words text-[12px] font-medium leading-snug">
        {text}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="rounded p-0.5 text-current opacity-70 transition hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
