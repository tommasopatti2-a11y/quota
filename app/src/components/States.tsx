import type { ReactNode } from 'react'

export function Spinner({ label = 'Caricamento…' }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <p className="state__title">Qualcosa non ha funzionato</p>
      <p className="muted">{message ?? 'Controlla la connessione e riprova.'}</p>
      {onRetry && (
        <button className="btn btn--ghost" onClick={onRetry}>
          Riprova
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <p className="state__title">{title}</p>
      {children && <div className="muted">{children}</div>}
      {action}
    </div>
  )
}
