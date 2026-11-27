import { Outlet } from 'react-router-dom'
import { OfflineBanner } from './OfflineBanner'

/** Layout a schermo intero, senza barra di navigazione, per i form. */
export function FormLayout() {
  return (
    <div className="shell">
      <OfflineBanner />
      <main className="shell__content shell__content--form">
        <Outlet />
      </main>
    </div>
  )
}
