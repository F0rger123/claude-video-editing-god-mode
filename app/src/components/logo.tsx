import { AGENCY_NAME, APP_NAME } from "@/lib/brand";
/** The app mark: a play triangle on a violet-to-ember tile with a spark. Same geometry as the app icons. */
export function LogoMark({ className = "size-8", tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gm-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset="0.6" stopColor="#c026d3" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
      </defs>
      {tile ? <rect width="512" height="512" rx="112" fill="url(#gm-tile)" /> : null}
      <path d="M190 140 L380 256 L190 372 Z" fill="#fff" stroke="#fff" strokeWidth="28" strokeLinejoin="round" />
      <path d="M380 88 l14 34 34 14 -34 14 -14 34 -14 -34 -34 -14 34 -14z" fill="#fff" opacity="0.9" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={compact ? "size-7" : "size-9"} />
      {compact ? null : (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
          <span className="block text-xs text-ash">{AGENCY_NAME}</span>
        </span>
      )}
    </span>
  );
}
