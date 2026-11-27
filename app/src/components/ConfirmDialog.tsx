import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Finestra di conferma che sale dal basso (raggiungibile con il pollice). */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog ref={ref} className="dialog" onCancel={(e) => (e.preventDefault(), onCancel())} onClick={(e) => e.target === ref.current && onCancel()}>
      <div className="dialog__body stack">
        <h2>{title}</h2>
        {children && <div className="muted">{children}</div>}
        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={busy}>
            Annulla
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn--danger-solid' : 'btn--primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Attendi…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
