import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Spinner, ErrorState } from './components/States'
import { useAuth } from './features/auth/AuthProvider'
import { LoginScreen } from './features/auth/LoginScreen'
import { TripsScreen } from './features/trips/TripsScreen'
import { TripFormScreen } from './features/trips/TripFormScreen'
import { FormLayout } from './components/FormLayout'
import { DashboardIndex, DashboardScreen } from './features/dashboard/DashboardScreen'
import { RawDataScreen } from './features/dashboard/RawDataScreen'
import { AccountScreen } from './features/account/AccountScreen'
import { isConfigured } from './lib/supabase'

export function App() {
  const { state, signOut } = useAuth()

  if (!isConfigured) {
    return (
      <main className="login">
        <ErrorState message="Configurazione mancante: imposta VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY." />
      </main>
    )
  }
  if (state.status === 'loading') return <Spinner label="Avvio…" />
  if (state.status === 'signed-out') return <LoginScreen />
  if (state.status === 'unauthorized') {
    return (
      <main className="login">
        <div className="state">
          <p className="state__title">Account non autorizzato</p>
          <p className="muted">Questo utente non è abilitato all'uso di Quota.</p>
          <button className="btn btn--ghost" onClick={signOut}>
            Esci
          </button>
        </div>
      </main>
    )
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/viaggi" element={<TripsScreen />} />
        <Route path="/dashboard" element={<DashboardIndex />} />
        <Route path="/dashboard/:id" element={<DashboardScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route path="*" element={<Navigate to="/viaggi" replace />} />
      </Route>
      <Route element={<FormLayout />}>
        <Route path="/viaggi/nuovo" element={<TripFormScreen />} />
        <Route path="/viaggi/:id" element={<TripFormScreen />} />
        <Route path="/dashboard/:id/dati" element={<RawDataScreen />} />
      </Route>
    </Routes>
  )
}
