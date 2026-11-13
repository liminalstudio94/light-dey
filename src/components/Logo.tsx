export function Logo({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight ${className}`}>
      <svg viewBox="0 0 32 32" aria-hidden className="h-7 w-7">
        <rect width="32" height="32" rx="9" fill={dark ? "#ffffff" : "#0f1115"} />
        <path d="M16 6.5a7 7 0 0 0-4 12.74V21.5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 16 6.5Z" fill="#ffc83d" />
        <rect x="13" y="23.5" width="6" height="2" rx="1" fill={dark ? "#0f1115" : "#ffffff"} />
      </svg>
      <span className={dark ? "text-white" : "text-ink"}>
        LIGHT DEY<span className="text-brand">?</span>
      </span>
    </span>
  );
}
