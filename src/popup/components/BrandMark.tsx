import { cn } from "@/lib/cn";
import squareLogo from "@/assets/squre_logo.svg";

interface BrandMarkProps {
  size?: number;
  className?: string;
  withGlow?: boolean;
}

export function BrandMark({ size = 48, className, withGlow = false }: BrandMarkProps) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      {withGlow && (
        <>
          <span className="absolute inset-0 rounded-3xl bg-brand-500/20 blur-2xl" />
          <span className="absolute inset-2 rounded-2xl bg-brand-500/25 blur-xl" />
        </>
      )}
      <img
        src={squareLogo}
        alt="TrackVid"
        className="relative block"
        style={{ width: size, height: size, objectFit: "contain" }}
        draggable={false}
      />
    </div>
  );
}
