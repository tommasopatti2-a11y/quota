import { useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorState, Spinner } from '../../components/States'
import { useToast } from '../../components/Toast'
import { formatDateTime, formatDayWeek, formatDuration, formatPrice } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Direction, FlightResult, Search } from '../../lib/types'
import { tripErrorMessage, useTrips } from '../trips/api'
import { useDashboard } from './api'
import { Segmented } from './ui'

const PAGE = 50
type DirFilter = 'all' | Direction

function baseQuery(tripId: string, dir: DirFilter, run: string) {
  let q = supabase.from('results').select('*').eq('trip_id', tripId)
  if (dir !== 'all') q = q.eq('direction', dir)
  if (run !== 'all') q = q.eq('run_at', run)
  return q.order('run_at', { ascending: false }).order('direction').order('flight_date').order('rank')
}

const csvCell = (v: unknown) => {
  const s = v == null ? '' : Array.isArray(v) ? v.join(', ') : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const STATUS_LABEL = { ok: 'Riuscita', empty: 'Nessun volo', error: 'Errore' } as const

/** Esito di ogni data cercata in una rilevazione: utile per capire se mancano voli. */
function SearchOutcomes({ tripId, runAt }: { tripId: string; runAt: string }) {
  const q = useQuery({
    queryKey: ['searches', tripId, runAt],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('searches')
        .select('id,direction,flight_date,status,found_count,results_count,error')
        .eq('trip_id', tripId)
        .eq('run_at', runAt)
        .order('direction')
        .order('flight_date')
      if (error) throw error
      return data as Pick<Search, 'id' | 'direction' | 'flight_date' | 'status' | 'found_count' | 'results_count' | 'error'>[]
    },
  })
  return (
    <section className="card stack">
      <div>
        <h2>Esito delle ricerche</h2>
        <p className="faint small">Rilevazione del {formatDateTime(runAt)} · voli trovati da Google e voli salvati</p>
      </div>
      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState message={tripErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ul className="outcomes">
          {q.data.map((s) => (
            <li key={s.id} className={`outcome outcome--${s.status}`}>
              <div className="row-between">
                <span>
                  {s.direction === 'outbound' ? 'Andata' : 'Ritorno'} · {formatDayWeek(s.flight_date)}
                </span>
                <span className="outcome__status">{STATUS_LABEL[s.status]}</span>
              </div>
              <span className="faint small">
                {s.found_count != null ? `${s.found_count} trovati · ` : ''}
                {s.results_count} salvati
                {s.error && ` · ${s.error}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function RawDataScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const trip = useTrips().data?.find((t) => t.id === id)
  const runs = useDashboard(id).data?.runs ?? []
  const [dir, setDir] = useState<DirFilter>('all')
  const [run, setRun] = useState('all')
  const [exporting, setExporting] = useState(false)

  const q = useInfiniteQuery({
    queryKey: ['raw', id, dir, run],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await baseQuery(id, dir, run).range(pageParam, pageParam + PAGE - 1)
      if (error) throw error
      return data as FlightResult[]
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  })
  const rows = q.data?.pages.flat() ?? []

  const exportCsv = async () => {
    setExporting(true)
    try {
      const all: FlightResult[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await baseQuery(id, dir, run).range(from, from + 999)
        if (error) throw error
        all.push(...(data as FlightResult[]))
        if (data.length < 1000) break
      }
      const head = ['Data rilevazione', 'Direzione', 'Data volo', 'Giorni mancanti', 'Posizione', 'Prezzo', 'Passeggeri', 'Prezzo a persona', 'Compagnie', 'Partenza', 'Arrivo', 'Giorni arrivo', 'Durata (min)', 'Volo (min)', 'Scali', 'Via']
      const lines = all.map((r) =>
        [
          new Date(r.run_at).toLocaleString('it-IT'),
          r.direction === 'outbound' ? 'Andata' : 'Ritorno',
          r.flight_date,
          r.days_left,
          r.rank,
          String(r.price).replace('.', ','),
          r.passengers,
          (Number(r.price) / r.passengers).toFixed(2).replace('.', ','),
          r.airlines,
          r.departure_time?.slice(0, 5),
          r.arrival_time?.slice(0, 5),
          r.arrival_day_offset,
          r.duration_min,
          r.flight_min,
          r.stops,
          r.via,
        ]
          .map(csvCell)
          .join(';'),
      )
      // BOM + punto e virgola: si apre correttamente in Excel con impostazioni italiane.
      const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `quota-${(trip?.name ?? 'viaggio').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`Esportate ${all.length} righe`, 'success')
    } catch (e) {
      toast(tripErrorMessage(e), 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="form-screen">
      <header className="form-screen__header">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div>
          <h1>Dati grezzi</h1>
          {trip && <p className="muted small">{trip.name}</p>}
        </div>
      </header>

      <section className="card stack">
        <Segmented
          label="Direzione"
          value={dir}
          onChange={setDir}
          options={[
            { value: 'all', label: 'Tutte' },
            { value: 'outbound', label: 'Andata' },
            { value: 'return', label: 'Ritorno' },
          ]}
        />
        <label className="field">
          <span className="field__label">Rilevazione</span>
          <select value={run} onChange={(e) => setRun(e.target.value)}>
            <option value="all">Tutte le rilevazioni</option>
            {[...runs].reverse().map((r) => (
              <option key={r.at} value={r.at}>
                {formatDateTime(r.at)} · {r.ok + r.empty}/{r.total} date
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--primary btn--block" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Preparo il file…' : 'Esporta CSV'}
        </button>
      </section>

      {(run !== 'all' || runs.length > 0) && <SearchOutcomes tripId={id} runAt={run !== 'all' ? run : runs[runs.length - 1].at} />}

      {q.isPending ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState message={tripErrorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="muted center">Nessun dato con questi filtri.</p>
      ) : (
        <ul className="raw">
          {rows.map((r) => (
            <li key={r.id} className="raw__row">
              <div className="row-between">
                <span className="small muted">
                  {formatDateTime(r.run_at)} · {r.direction === 'outbound' ? 'Andata' : 'Ritorno'} {formatDayWeek(r.flight_date)}
                </span>
                <strong>{formatPrice(Number(r.price))}</strong>
              </div>
              <div className="faint small">
                #{r.rank} · {r.airlines.join(', ') || 'n.d.'} · {r.departure_time?.slice(0, 5) ?? '—'}–{r.arrival_time?.slice(0, 5) ?? '—'} ·{' '}
                {formatDuration(r.duration_min ?? r.flight_min)} · {r.stops == null ? 'scali n.d.' : r.stops === 0 ? 'diretto' : r.stops === 1 ? '1 scalo' : `${r.stops} scali`} · {r.passengers} pax
              </div>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <button className="btn btn--ghost btn--block" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {q.isFetchingNextPage ? 'Carico…' : 'Carica altri'}
        </button>
      )}
    </div>
  )
}
