// Trasforma la risposta di trip_dashboard() in strutture pronte per KPI e grafici.
// Tutti i prezzi qui sono "a persona" (pp); la UI li moltiplica per i passeggeri.

import type { Direction, Priority, SearchStatus } from '../../lib/types'

/** Criterio di scelta del volo. */
export type Criterion = 'best' | 'cheap' | 'fast' | 'direct'
export const CRITERIA: Criterion[] = ['best', 'cheap', 'fast', 'direct']
export const CRITERION_LABEL: Record<Criterion, string> = {
  best: 'Consigliato',
  cheap: 'Più economico',
  fast: 'Più veloce',
  direct: 'Solo diretti',
}

export interface LatestFlight {
  id: number
  direction: Direction
  flight_date: string
  rank: number
  pp: number
  score: number | null
  airlines: string[]
  departure_time: string | null
  arrival_time: string | null
  arrival_day_offset: number
  duration_min: number | null
  flight_min: number | null
  stops: number | null
  via: string[]
  link: string | null
}

type SeriesRow = [number, Direction, string, number, number | null, number | null, number | null, number | null, number | null]

export interface DashboardRaw {
  priority: Priority
  weights: { hour: number; stop: number }
  runs: [string, number, number, number, number][]
  series: SeriesRow[]
  latest: LatestFlight[]
  latest_searches: [Direction, string, SearchStatus][]
  by_airline: [Direction, string, number, number, number][]
  by_stops: [Direction, number, number, number, number][]
}

export interface Run {
  idx: number
  at: string
  time: number
  total: number
  ok: number
  empty: number
  error: number
}

export interface Best {
  pp: number
  date: string
}

export interface RunPoint {
  out: Best | null
  ret: Best | null
  total: number | null
}

export interface GroupStat {
  label: string
  min: number
  avg: number
  n: number
}

export interface Dashboard {
  priority: Priority
  weights: { hour: number; stop: number }
  runs: Run[]
  points: Record<Criterion, RunPoint[]> // per rilevazione
  byDate: Record<Criterion, Record<Direction, Map<string, (number | null)[]>>> // data volo → pp per rilevazione
  lastIdx: number // ultima rilevazione con almeno un prezzo (-1 se nessuna)
  latest: LatestFlight[]
  latestSearches: DashboardRaw['latest_searches']
  byAirline: Record<Direction, GroupStat[]>
  byStops: Record<Direction, GroupStat[]>
}

const stopsLabel = (s: number) => (s === 0 ? 'Diretto' : s === 1 ? '1 scalo' : `${s} scali`)
export const round2 = (v: number) => Math.round(v * 100) / 100
const num = (v: unknown) => (v == null ? null : Number(v))

interface Cell {
  date: string
  cheap: number
  best: number | null
  bestScore: number | null
  fast: number | null
  fastDur: number | null
  direct: number | null
}

/** Sceglie la data migliore di una rilevazione secondo il criterio. */
function pick(cells: Cell[], crit: Criterion): Best | null {
  let b: { pp: number; date: string; key: number } | null = null
  for (const c of cells) {
    const pp = crit === 'cheap' ? c.cheap : crit === 'best' ? c.best : crit === 'fast' ? c.fast : c.direct
    const key = crit === 'best' ? c.bestScore : crit === 'fast' ? c.fastDur : pp
    if (pp == null || key == null) continue
    if (!b || key < b.key || (key === b.key && pp < b.pp)) b = { pp, date: c.date, key }
  }
  return b && { pp: b.pp, date: b.date }
}

export function buildDashboard(raw: DashboardRaw): Dashboard {
  const runs: Run[] = raw.runs.map(([at, total, ok, empty, error], idx) => ({
    idx,
    at,
    time: new Date(at).getTime(),
    total,
    ok,
    empty,
    error,
  }))
  const n = runs.length
  const cells: Record<Direction, Cell[]>[] = runs.map(() => ({ outbound: [], return: [] }))
  const emptyDir = () => ({ outbound: new Map<string, (number | null)[]>(), return: new Map<string, (number | null)[]>() })
  const byDate = { best: emptyDir(), cheap: emptyDir(), fast: emptyDir(), direct: emptyDir() } as Dashboard['byDate']

  for (const [idx, dir, date, cheap, best, bestScore, fast, fastDur, direct] of raw.series) {
    const c: Cell = {
      date,
      cheap: Number(cheap),
      best: num(best),
      bestScore: num(bestScore),
      fast: num(fast),
      fastDur: num(fastDur),
      direct: num(direct),
    }
    cells[idx][dir].push(c)
    for (const crit of CRITERIA) {
      let arr = byDate[crit][dir].get(date)
      if (!arr) byDate[crit][dir].set(date, (arr = Array(n).fill(null)))
      arr[idx] = crit === 'cheap' ? c.cheap : crit === 'best' ? c.best : crit === 'fast' ? c.fast : c.direct
    }
  }
  for (const crit of CRITERIA)
    for (const dir of ['outbound', 'return'] as const)
      byDate[crit][dir] = new Map([...byDate[crit][dir]].sort(([a], [b]) => a.localeCompare(b)))

  const points = Object.fromEntries(
    CRITERIA.map((crit) => [
      crit,
      cells.map((r) => {
        const out = pick(r.outbound, crit)
        const ret = pick(r.return, crit)
        return { out, ret, total: out && ret ? round2(out.pp + ret.pp) : null }
      }),
    ]),
  ) as Record<Criterion, RunPoint[]>

  let lastIdx = -1
  for (let i = n - 1; i >= 0; i--)
    if (cells[i].outbound.length || cells[i].return.length) {
      lastIdx = i
      break
    }

  const group = (rows: [Direction, string | number, number, number, number][], label: (k: string | number) => string) => {
    const out: Record<Direction, GroupStat[]> = { outbound: [], return: [] }
    for (const [dir, k, min, avg, cnt] of rows) out[dir].push({ label: label(k), min: Number(min), avg: Number(avg), n: cnt })
    for (const d of ['outbound', 'return'] as const) out[d].sort((a, b) => a.min - b.min)
    return out
  }

  return {
    priority: raw.priority ?? 'equilibrio',
    weights: raw.weights ?? { hour: 20, stop: 30 },
    runs,
    points,
    byDate,
    lastIdx,
    latest: raw.latest.map((f) => ({ ...f, pp: Number(f.pp), score: num(f.score) })),
    latestSearches: raw.latest_searches,
    byAirline: group(raw.by_airline, String),
    byStops: group(raw.by_stops, (k) => stopsLabel(Number(k))),
  }
}

/** Valore precedente non nullo prima di idx. */
export function previous<T>(values: (T | null)[], idx: number): { value: T; idx: number } | null {
  for (let i = idx - 1; i >= 0; i--) if (values[i] != null) return { value: values[i] as T, idx: i }
  return null
}

export function minWithIndex(values: (number | null)[]): { value: number; idx: number } | null {
  let r: { value: number; idx: number } | null = null
  values.forEach((v, idx) => {
    if (v != null && (!r || v < r.value)) r = { value: v, idx }
  })
  return r
}

export const durationOf = (f: LatestFlight) => f.duration_min ?? f.flight_min

/** Il volo che rappresenta un criterio per una data, tra quelli dell'ultima rilevazione. */
export function flightFor(latest: LatestFlight[], dir: Direction, date: string, crit: Criterion): LatestFlight | null {
  const xs = latest.filter((f) => f.direction === dir && f.flight_date === date)
  const by = (key: (f: LatestFlight) => number | null) =>
    xs
      .filter((f) => key(f) != null)
      .sort((a, b) => key(a)! - key(b)! || a.pp - b.pp)[0] ?? null
  if (crit === 'cheap') return by((f) => f.pp)
  if (crit === 'best') return by((f) => f.score)
  if (crit === 'fast') return by(durationOf)
  return by((f) => (f.stops === 0 ? f.pp : null))
}

/** Media storica dei prezzi di un criterio per una data. */
export function historicalAvg(values: (number | null)[] | undefined): number | null {
  const present = (values ?? []).filter((v): v is number => v != null)
  return present.length ? round2(present.reduce((a, b) => a + b, 0) / present.length) : null
}

const dayMs = 86_400_000
const localDay = (iso: string) => {
  const d = new Date(iso)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}
const dayUTC = (date: string) => {
  const [y, m, dd] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, dd)
}

/** Prezzo medio in funzione dei giorni mancanti alla partenza, per un criterio. */
export function byDaysLeft(d: Dashboard, dir: Direction, crit: Criterion): { days: number; pp: number; n: number }[] {
  const acc = new Map<number, { sum: number; n: number }>()
  for (const [date, values] of d.byDate[crit][dir]) {
    values.forEach((v, idx) => {
      if (v == null) return
      const days = Math.round((dayUTC(date) - localDay(d.runs[idx].at)) / dayMs)
      const a = acc.get(days) ?? { sum: 0, n: 0 }
      a.sum += v
      a.n += 1
      acc.set(days, a)
    })
  }
  return [...acc]
    .map(([days, a]) => ({ days, pp: round2(a.sum / a.n), n: a.n }))
    .sort((a, b) => b.days - a.days)
}

/** Date della finestra ±w attorno a una data, come "YYYY-MM-DD". */
export function windowDates(center: string, w: number): string[] {
  const base = dayUTC(center)
  return Array.from({ length: 2 * w + 1 }, (_, i) => new Date(base + (i - w) * dayMs).toISOString().slice(0, 10))
}
