export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="4" y="12" width="56" height="40" rx="8" fill="#14757d" />
      <path d="M6 16 L32 36 L58 16" fill="none" stroke="#fbf7ef" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 30 L44 34 L44 44 Q44 54 32 58 Q20 54 20 44 L20 34 Z" fill="#c8962e" stroke="#fbf7ef" strokeWidth="3" />
      <path d="M32 38 L32 50 M27 43 L37 43" stroke="#fbf7ef" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-word">
        Inbox<span>Arena</span>
      </span>
    </span>
  );
}
