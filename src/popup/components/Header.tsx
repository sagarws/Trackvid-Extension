import { Settings as SettingsIcon } from "lucide-react";
import logoWithName from "@/assets/logo_with_name.svg";

interface HeaderProps {
  onOpenSettings: () => void;
  showSettings?: boolean;
}

export function Header({ onOpenSettings, showSettings = true }: HeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 pb-3 pt-4">
      <img
        src={logoWithName}
        alt="TrackVid"
        className="h-8 w-auto select-none"
        draggable={false}
      />
      {showSettings && (
        <button
          onClick={onOpenSettings}
          aria-label="Open settings"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink-300/60 bg-white text-ink-500 transition hover:border-brand-400 hover:text-brand-600"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
