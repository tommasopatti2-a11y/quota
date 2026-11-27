import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { PullToRefresh } from '../../components/PullToRefresh'
import { EmptyState, ErrorState, Spinner } from '../../components/States'
import { formatDay, todayISO } from '../../lib/format'
import type { Direction, Priority, Trip } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useQueryClient } from '@tanstack/react-query'
import { tripErrorMessage, useSaveTrip, useTrips } from '../trips/api'
import { formFromTrip, toInput } from '../trips/validation'
import { useDashboard } from './api'
import { DaysLeftSection } from './DaysLeftSection'
import { FlightsSection, type FlightsFilter } from './FlightsSection'
import { GroupStatsSection } from './GroupStatsSection'
import { type Criterion, windowDates } from './model'
import { OptionCards } from './OptionCards'
import { OptionsTable } from './OptionsTable'
import { TrendSection } from './TrendSection'
import { Segmented } from './ui'

const LAST_KEY = 'quota-last-trip'
const readLast = () => {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}
const writeLast = (id: string) => {
  try {
    localStorage.setItem(LAST_KEY, id)
  } catch {
    /* ignora */
  }
}

/** Prossima rilevazione pianificata (06:00 e 17:00 UTC), in ora locale. */
export function nextRunLabel(now = new Date()) {
  const cands = [0, 1].flatMap((dd) =>
    [6, 17].map((h) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dd, h))),
  )
  const next = cands.find((c) => c > now)!
  const sameDay = next.toDateString() === now.toDateString()
  const time = next.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return `${sameDay ? 'oggi' : 'domani'} alle ${time}`
}

/** /dashboard: apre l'ultimo viaggio consultato o il primo attivo. */
export function DashboardIndex() {
  const { data, isPending, isError, error, refetch } = useTrips()
  if (isPending) return <Spinner />
  if (isError) return <ErrorState message={tripErrorMessage(error)} onRetry={() => refetch()} />
  const today = todayISO()
  const last = readLast()
  const target =
    data.find((t) => t.id === last) ?? data.find((t) => t.active && t.outbound_date >= today) ?? data[0]
  if (!target)
    return (
      <EmptyState
        title="Nessun viaggio da analizzare"
        action={
          <Link to="/viaggi/nuovo" className="btn btn--primary">
            Crea un viaggio
          </Link>
        }
      >
        La dashboard mostra l'andamento dei prezzi dei tuoi viaggi.
      </EmptyState>
    )
  return <Navigate to={`/dashboard/${target.id}`} replace />
}

function TripPicker({ trips, current }: { trips: Trip[]; current: Trip }) {
  const navigate = useNavigate()
  const today = todayISO()
  const inCorso = trips.filter((t) => t.outbound_date >= today)
  const concluded: [string, Trip[]] = ['Conclusi', trips.filter((t) => t.outbound_date < today)]
  // Con i gruppi: un blocco per gruppo (i viaggi in pausa sono indicati nel nome).
  const groups: [string, Trip[]][] = inCorso.some((t) => t.group_name)
    ? [
        ...[...new Set(inCorso.map((t) => t.group_name ?? ''))]
          .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'it')))
          .map((g): [string, Trip[]] => [
            g || 'Senza gruppo',
            inCorso.filter((t) => (t.group_name ?? '') === g).sort((a, b) => Number(b.active) - Number(a.active)),
          ]),
        concluded,
      ]
    : [['Attivi', inCorso.filter((t) => t.active)], ['In pausa', inCorso.filter((t) => !t.active)], concluded]
  return (
    <label className="trip-picker">
      <span className="sr-only">Viaggio</span>
      <select value={current.id} onChange={(e) => navigate(`/dashboard/${e.target.value}`)}>
        {groups.map(([label, xs]) =>
          xs.length ? (
            <optgroup key={label} label={label}>
              {xs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {!t.active && t.outbound_date >= today ? ' (in pausa)' : ''}
                </option>
              ))}
            </optgroup>
          ) : null,
        )}
      </select>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  )
}

/** true quando l'elemento sentinella è uscito dallo schermo (intestazione "agganciata"). */
function useStuck(ref: React.RefObject<HTMLDivElement | null>) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  })
  return stuck
}

const PRIORITY_LABEL: Record<Priority, string> = { risparmio: 'Risparmio', equilibrio: 'Equilibrio', comodita: 'Comodità' }

function PriorityPicker({ trip }: { trip: Trip }) {
  const save = useSaveTrip()
  const qc = useQueryClient()
  const toast = useToast()
  return (
    <label className="prio-picker">
      <span className="faint">Priorità</span>
      <select
        value={trip.priority}
        disabled={save.isPending}
        onChange={(e) =>
          save.mutate(
            { id: trip.id, input: { ...toInput(formFromTrip(trip)), priority: e.target.value as Priority } },
            {
              onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', trip.id] }),
              onError: (err) => toast(tripErrorMessage(err), 'error'),
            },
          )
        }
      >
        {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DashboardScreen() {
  const { id } = useParams()
  const trips = useTrips()
  const dash = useDashboard(id)
  const trip = trips.data?.find((t) => t.id === id)
  const [unit, setUnit] = useState<'total' | 'pp'>('total')
  const [crit, setCrit] = useState<Criterion>('best')
  const [filter, setFilter] = useState<FlightsFilter>({ dir: 'outbound', date: 'all' })
  const flightsRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const stuck = useStuck(sentinelRef)

  // Cambiando viaggio si riparte dai filtri predefiniti.
  useEffect(() => {
    setCrit('best')
    setFilter({ dir: 'outbound', date: 'all' })
  }, [id])

  useEffect(() => {
    if (trip) writeLast(trip.id)
  }, [trip])

  const onRefresh = useCallback(() => Promise.all([dash.refetch(), trips.refetch()]), [dash, trips])

  const dates = useMemo<Record<Direction, string[]>>(
    () =>
      trip
        ? { outbound: windowDates(trip.outbound_date, trip.window_days), return: windowDates(trip.return_date, trip.window_days) }
        : { outbound: [], return: [] },
    [trip],
  )

  if (trips.isPending) return <Spinner />
  if (trips.isError && !trips.data) return <ErrorState message={tripErrorMessage(trips.error)} onRetry={() => trips.refetch()} />
  if (!trip) return <ErrorState message="Questo viaggio non esiste più." />

  const pax = trip.passengers
  const mult = unit === 'total' ? pax : 1
  const d = dash.data
  const concluded = trip.outbound_date < todayISO()

  return (
    <PullToRefresh onRefresh={onRefresh}>
      <div ref={sentinelRef} className="dash-sentinel" aria-hidden="true" />
      <div className={`dash-sticky${stuck ? ' is-stuck' : ''}`}>
        <div className="dash-head__row">
          <TripPicker trips={trips.data} current={trip} />
          <Link to={`/viaggi/${trip.id}`} className="icon-btn" aria-label="Modifica viaggio">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
        <p className="muted small">
          {trip.origin} → {trip.destination} · {formatDay(trip.outbound_date)} – {formatDay(trip.return_date)} · ±{trip.window_days} gg
          {!trip.active && <span className="pill dash-head__pill">{concluded ? 'Concluso' : 'In pausa'}</span>}
        </p>
      </div>
      <header className="dash-head">
        <PriorityPicker trip={trip} />
        {pax > 1 && (
          <Segmented
            label="Prezzi mostrati"
            value={unit}
            onChange={setUnit}
            options={[
              { value: 'total', label: `Totale ${pax} passeggeri` },
              { value: 'pp', label: 'A persona' },
            ]}
          />
        )}
      </header>

      {dash.isPending ? (
        <Spinner label="Carico le statistiche…" />
      ) : dash.isError && !d ? (
        <ErrorState message={tripErrorMessage(dash.error)} onRetry={() => dash.refetch()} />
      ) : !d || d.runs.length === 0 ? (
        <EmptyState title="Nessuna rilevazione ancora">
          {trip.active
            ? `La prima rilevazione è prevista ${nextRunLabel()}. Puoi anche avviarla subito da GitHub Actions.`
            : 'Il viaggio è in pausa: attivalo per iniziare a raccogliere i prezzi.'}
        </EmptyState>
      ) : d.lastIdx < 0 ? (
        <EmptyState title="Nessun prezzo trovato">
          Le {d.runs.length} rilevazioni fatte finora non hanno restituito voli. Controlla i codici degli aeroporti o
          l'esito del workflow su GitHub.
        </EmptyState>
      ) : (
        <div className={`dash${dash.isFetching ? ' is-refreshing' : ''}`}>
          <OptionCards d={d} mult={mult} value={crit} onChange={setCrit} />
          <TrendSection d={d} mult={mult} dates={dates} crit={crit} />
          <OptionsTable
            d={d}
            mult={mult}
            dates={dates}
            onPick={(dir, date) => {
              setFilter({ dir, date })
              requestAnimationFrame(() => flightsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
            }}
          />
          <FlightsSection
            ref={flightsRef}
            d={d}
            mult={mult}
            filter={filter}
            onFilter={setFilter}
            perPersonLabel={unit === 'total' && pax > 1 ? `${pax} pax` : pax > 1 ? 'a persona' : ''}
          />
          <GroupStatsSection d={d} mult={mult} />
          <DaysLeftSection d={d} mult={mult} crit={crit} />
          <Link to={`/dashboard/${trip.id}/dati`} className="btn btn--ghost btn--block">
            Dati grezzi ed esportazione CSV
          </Link>
        </div>
      )}
    </PullToRefresh>
  )
}
