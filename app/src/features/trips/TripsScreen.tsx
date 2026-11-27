import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { PullToRefresh } from '../../components/PullToRefresh'
import { ScreenHeader } from '../../components/ScreenHeader'
import { EmptyState, ErrorState, Spinner } from '../../components/States'
import { useToast } from '../../components/Toast'
import { todayISO } from '../../lib/format'
import type { Trip } from '../../lib/types'
import { useAirports } from '../../lib/useAirports'
import { TripCard } from './TripCard'
import { tripErrorMessage, useToggleTrip, useTrips } from './api'

/** Orari locali delle due rilevazioni (il workflow gira alle 06:00 e 17:00 UTC). */
const runTimes = () => {
  const fmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' })
  const d = new Date()
  return [6, 17].map((h) => fmt.format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h)))).join(' e alle ')
}

export function TripsScreen() {
  const { data, isPending, isError, error, refetch } = useTrips()
  const airports = useAirports()
  const toggle = useToggleTrip()
  const toast = useToast()
  const [showConcluded, setShowConcluded] = useState(false)
  const today = todayISO()

  const onRefresh = useCallback(() => refetch(), [refetch])

  const onToggle = (trip: Trip, active: boolean) =>
    toggle.mutate(
      { id: trip.id, active },
      {
        onSuccess: () => toast(active ? `«${trip.name}» attivato` : `«${trip.name}» messo in pausa`, 'success'),
        onError: (e) => toast(tripErrorMessage(e), 'error'),
      },
    )

  const concluded = (t: Trip) => t.outbound_date < today
  const active = data?.filter((t) => t.active && !concluded(t)) ?? []
  const paused = data?.filter((t) => !t.active && !concluded(t)) ?? []
  const past = (data?.filter(concluded) ?? []).reverse()

  const renderList = (xs: Trip[]) => (
    <ul className="list">
      {xs.map((t) => (
        <TripCard
          key={t.id}
          trip={t}
          airports={airports}
          concluded={concluded(t)}
          busy={toggle.isPending && toggle.variables?.id === t.id}
          onToggle={(v) => onToggle(t, v)}
        />
      ))}
    </ul>
  )

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <ScreenHeader title="Viaggi" subtitle={`Rilevazioni ogni giorno alle ${runTimes()}`} />

      {isPending ? (
        <Spinner />
      ) : isError && !data ? (
        <ErrorState message={tripErrorMessage(error)} onRetry={() => refetch()} />
      ) : data.length === 0 ? (
        <EmptyState
          title="Nessun viaggio"
          action={
            <Link to="/viaggi/nuovo" className="btn btn--primary">
              Aggiungi il primo viaggio
            </Link>
          }
        >
          Crea un viaggio: Quota ne seguirà i prezzi due volte al giorno.
        </EmptyState>
      ) : (
        <>
          <section className="section">
            <h2 className="section__title">
              Attivi <span className="faint">{active.length}</span>
            </h2>
            {active.length ? renderList(active) : <p className="muted small">Nessun viaggio attivo al momento.</p>}
          </section>

          {paused.length > 0 && (
            <section className="section">
              <h2 className="section__title">
                In pausa <span className="faint">{paused.length}</span>
              </h2>
              {renderList(paused)}
            </section>
          )}

          {past.length > 0 && (
            <section className="section">
              <button className="section__toggle" onClick={() => setShowConcluded((v) => !v)} aria-expanded={showConcluded}>
                <h2 className="section__title">
                  Conclusi <span className="faint">{past.length}</span>
                </h2>
                <span className="faint small">{showConcluded ? 'Nascondi' : 'Mostra'}</span>
              </button>
              {showConcluded && renderList(past)}
            </section>
          )}
        </>
      )}

      <Link to="/viaggi/nuovo" className="fab" aria-label="Nuovo viaggio">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <span>Nuovo viaggio</span>
      </Link>
    </PullToRefresh>
  )
}
