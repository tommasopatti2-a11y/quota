import { useRegisterSW } from 'virtual:pwa-register/react'

/** Avvisa quando è disponibile una nuova versione dell'app. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Controlla aggiornamenti ogni ora mentre l'app è aperta.
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="toast" role="status">
      <span>È disponibile una nuova versione.</span>
      <div className="toast__actions">
        <button className="btn btn--ghost btn--sm" onClick={() => setNeedRefresh(false)}>
          Più tardi
        </button>
        <button className="btn btn--primary btn--sm" onClick={() => updateServiceWorker(true)}>
          Aggiorna
        </button>
      </div>
    </div>
  )
}
