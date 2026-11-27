export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <circle cx="246" cy="246" r="132" fill="none" stroke="var(--sage)" strokeWidth="44" />
      <path d="M300 300 L392 392" stroke="var(--sage)" strokeWidth="48" strokeLinecap="round" />
      <g transform="translate(238 236) rotate(45) scale(0.88)">
        <path d="M0,-64 C7,-64 9,-56 9,-48 L9,-14 L62,16 L62,30 L9,16 L9,40 L26,52 L26,62 L0,56 L-26,62 L-26,52 L-9,40 L-9,16 L-62,30 L-62,16 L-9,-14 L-9,-48 C-9,-56 -7,-64 0,-64 Z" fill="var(--lavender)" />
      </g>
    </svg>
  )
}
