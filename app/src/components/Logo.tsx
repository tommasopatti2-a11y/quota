export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <circle cx="246" cy="246" r="132" fill="none" stroke="var(--sage)" strokeWidth="44" />
      <path d="M300 300 L392 392" stroke="var(--sage)" strokeWidth="48" strokeLinecap="round" />
      <polyline
        points="170,278 218,232 258,258 322,196"
        fill="none"
        stroke="var(--lavender)"
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
