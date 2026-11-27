import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ScreenHeader } from '../../components/ScreenHeader'
import { useAuth } from '../auth/AuthProvider'
import { persister } from '../../lib/queryClient'

export function AccountScreen() {
  const { state, signOut } = useAuth()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)
  const email = state.status === 'signed-in' ? state.session.user.email : undefined

  const clearCache = async () => {
    await persister.removeClient()
    await qc.invalidateQueries()
    setMsg('Dati locali cancellati e ricaricati.')
  }

  return (
    <>
      <ScreenHeader title="Account" />
      <section className="card stack">
        <div>
          <p className="field__label">Accesso effettuato come</p>
          <p>{email ?? '—'}</p>
        </div>
        <button className="btn btn--ghost btn--block" onClick={clearCache}>
          Svuota la cache locale
        </button>
        {msg && <p className="muted small">{msg}</p>}
        <button className="btn btn--danger btn--block" onClick={signOut}>
          Esci
        </button>
      </section>
      <p className="muted small center">Quota · versione {__APP_VERSION__}</p>
    </>
  )
}
