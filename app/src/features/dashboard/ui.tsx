import type { ReactNode } from 'react'
import { formatPrice } from '../../lib/format'

export const COLORS = {
  outbound: '#4f9be6',
  return: '#de7a3a',
  total: '#9b86ee',
  context: '#6f7686',
} as const

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'is-on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={`chip${o.value === value ? ' is-on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Section({ title, subtitle, children, action }: { title: string; subtitle?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card dash-section">
      <header className="dash-section__head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="faint small">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

/** Variazione di prezzo: in calo = buono. Icona + testo, mai solo colore. */
export function Delta({ now, before, suffix }: { now: number; before: number; suffix?: string }) {
  const diff = now - before
  if (Math.abs(diff) < 0.5) return <span className="delta">= invariato{suffix}</span>
  const pct = (diff / before) * 100
  const down = diff < 0
  return (
    <span className={`delta ${down ? 'delta--down' : 'delta--up'}`}>
      <span aria-hidden="true">{down ? '▼' : '▲'}</span> {down ? '−' : '+'}
      {formatPrice(Math.abs(diff))} ({Math.abs(pct).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%){suffix}
    </span>
  )
}
