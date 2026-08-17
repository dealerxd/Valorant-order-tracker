/** Gold mountain triangle. The only "asset" in the design — inline SVG. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      style={{ width: size, height: size, flexShrink: 0, filter: 'drop-shadow(0 2px 8px rgba(212,175,55,.25))' }}
      aria-hidden
    >
      <defs>
        <linearGradient id="resellbot-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8c95a" />
          <stop offset="1" stopColor="#b8962f" />
        </linearGradient>
      </defs>
      <path d="M4 52 L22 20 L32 36 L40 24 L60 52 Z" fill="url(#resellbot-logo)" />
      <path d="M22 20 L32 36 L26 36 Z" fill="#1a1505" opacity=".25" />
    </svg>
  );
}
