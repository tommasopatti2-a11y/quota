import { forwardRef, useMemo, useState } from 'react'
import { formatDayWeek, formatDuration, formatDurationDelta, formatPrice } from '../../lib/format'
import type { Direction } from '../../lib/types'
import { type Dashboard, durationOf, type LatestFlight, routeOf } from './model'
import { Chips, Section, Segmented } from './ui'

type Sort = 'score' | 'price' | 'duration'
type MaxStops = 'any' | '0' | '1' | '2'

export interface FlightsFilter {
  dir: Direction
  date: string // 'all' o YYYY-MM-DD
}

interface Props {
  d: Dashboard
  mult: number
  perPersonLabel: string
  filter: FlightsFilter
  onFilter: (f: FlightsFilter) => void
}

const keyOf = (f: LatestFlight) => `${f.direction}|${f.flight_date}`

export const FlightsSection = forwardRef<HTMLDivElement, Props>(function FlightsSection({ d, mult, perPersonLabel, filter, onFilter }, ref) {
  const [maxStops, setMaxStops] = useState<MaxStops>('any')
  const [sort, setSort] = useState<Sort>('score')
  const [showAll, setShowAll] = useState(false)
  const [route, setRoute] = useState('all')
  const { dir, date } = filter

  // Riferimenti per data: consigliato, più economico, più veloce.
  const refs = useMemo(() => {
    const m = new Map<string, { best?: LatestFlight; cheap?: LatestFlight; fast?: LatestFlight }>()
    for (const f of d.latest) {
      const r = m.get(keyOf(f)) ?? {}
      if (f.score != null && (!r.best || f.score < r.best.score!)) r.best = f
      if (!r.cheap || f.pp < r.cheap.pp) r.cheap = f
      const du = durationOf(f)
      if (du != null && (!r.fast || du < durationOf(r.fast)! || (du === durationOf(r.fast) && f.pp < r.fast.pp))) r.fast = f
      m.set(keyOf(f), r)
    }
    return m
  }, [d])

  const routes = useMemo(
    () => [...new Set(d.latest.filter((f) => f.direction === dir).map(routeOf).filter((r): r is string => Boolean(r)))].sort(),
    [d, dir],
  )
  const dates = useMemo(() => [...new Set(d.latest.filter((f) => f.direction === dir).map((f) => f.flight_date))].sort(), [d, dir])
  const flights = useMemo(() => {
    const dur = (f: LatestFlight) => durationOf(f) ?? Infinity
    const sc = (f: LatestFlight) => f.score ?? Infinity
    return d.latest
      .filter((f) => f.direction === dir)
      .filter((f) => date === 'all' || f.flight_date === date)
      .filter((f) => route === 'all' || routeOf(f) === route)
      .filter((f) => maxStops === 'any' || (f.stops != null && f.stops <= Number(maxStops)))
      .sort((a, b) =>
        sort === 'score' ? sc(a) - sc(b) || a.pp - b.pp : sort === 'price' ? a.pp - b.pp || dur(a) - dur(b) : dur(a) - dur(b) || a.pp - b.pp,
      )
  }, [d, dir, date, maxStops, sort, route])

  return (
    <div ref={ref} className="scroll-anchor">
      <Section
        title={date === 'all' ? "Voli dell'ultima rilevazione" : `Voli di ${formatDayWeek(date)}`}
        subtitle={sort === 'score' ? 'Ordinati per convenienza' : sort === 'price' ? 'Ordinati per prezzo' : 'Ordinati per durata'}
      >
        <Segmented
          label="Direzione"
          value={dir}
          onChange={(v) => {
            setRoute('all')
            onFilter({ dir: v, date: 'all' })
          }}
          options={[
            { value: 'outbound', label: 'Andata' },
            { value: 'return', label: 'Ritorno' },
          ]}
        />
        <Chips
          label="Data del volo"
          value={date}
          onChange={(v) => onFilter({ dir, date: v })}
          options={[{ value: 'all', label: 'Tutte le date' }, ...dates.map((x) => ({ value: x, label: formatDayWeek(x) }))]}
        />
        {routes.length > 1 && (
          <Chips
            label="Aeroporti"
            value={route}
            onChange={setRoute}
            options={[{ value: 'all', label: 'Tutti gli aeroporti' }, ...routes.map((r) => ({ value: r, label: r }))]}
          />
        )}
        <div className="row-between flights-filters">
          <Chips
            label="Scali massimi"
            value={maxStops}
            onChange={setMaxStops}
            options={[
              { value: 'any', label: 'Tutti' },
              { value: '0', label: 'Diretti' },
              { value: '1', label: 'Max 1 scalo' },
              { value: '2', label: 'Max 2' },
            ]}
          />
          <label className="sort">
            <span className="sr-only">Ordina per</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="score">Convenienza</option>
              <option value="price">Prezzo</option>
              <option value="duration">Durata</option>
            </select>
          </label>
        </div>

        {flights.length === 0 ? (
          <p className="muted small chart-empty">Nessun volo con questi filtri.</p>
        ) : (
          <ul className="flights">
            {(showAll ? flights : flights.slice(0, 6)).map((f) => {
              const r = refs.get(keyOf(f)) ?? {}
              const isBest = r.best?.id === f.id
              const best = r.best
              const dp = best ? (f.pp - best.pp) * mult : 0
              const dd = best && durationOf(f) != null && durationOf(best) != null ? durationOf(f)! - durationOf(best)! : null
              return (
                <li key={f.id} className={`flight${isBest ? ' is-best' : ''}`}>
                  <div className="flight__top">
                    <strong className="flight__price">{formatPrice(f.pp * mult)}</strong>
                    <span className="faint small">{perPersonLabel}</span>
                    <span className="flight__tags">
                      {isBest && <span className="tag tag--best">★ Consigliato</span>}
                      {r.cheap?.id === f.id && <span className="tag">Più economico</span>}
                      {r.fast?.id === f.id && <span className="tag">Più veloce</span>}
                      {f.stops === 0 && <span className="tag tag--direct">Diretto</span>}
                    </span>
                  </div>
                  <div className="flight__times">
                    <span>{f.departure_time ?? '—'}</span>
                    <span className="flight__line" aria-hidden="true" />
                    <span>
                      {f.arrival_time ?? '—'}
                      {f.arrival_day_offset > 0 && <sup className="flight__plus">+{f.arrival_day_offset}</sup>}
                    </span>
                  </div>
                  <div className="flight__meta small">
                    {routeOf(f) && (
                      <>
                        <span className="flight__route">{routeOf(f)}</span>
                        <span className="dot">·</span>
                      </>
                    )}
                    <span>{formatDuration(durationOf(f))}</span>
                    <span className="dot">·</span>
                    <span>
                      {f.stops == null ? 'Scali n.d.' : f.stops === 0 ? 'Diretto' : `${f.stops} ${f.stops === 1 ? 'scalo' : 'scali'}`}
                      {f.via.length > 0 && ` (${f.via.join(', ')})`}
                    </span>
                    {date === 'all' && (
                      <>
                        <span className="dot">·</span>
                        <span>{formatDayWeek(f.flight_date)}</span>
                      </>
                    )}
                  </div>
                  {!isBest && best && (Math.abs(dp) >= 1 || (dd != null && Math.abs(dd) >= 5)) && (
                    <div className="flight__cmp small">
                      {dp <= -1 ? '−' : '+'}
                      {formatPrice(Math.abs(dp))}
                      {dd != null && Math.abs(dd) >= 5 && ` · ${formatDurationDelta(dd)}`} rispetto al consigliato
                    </div>
                  )}
                  <div className="flight__bottom">
                    <span className="muted small flight__airlines">{f.airlines.join(', ') || 'Compagnia n.d.'}</span>
                    {f.link && (
                      <a className="btn btn--ghost btn--sm" href={f.link} target="_blank" rel="noopener noreferrer">
                        Google Voli ↗
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {flights.length > 6 && (
          <button className="btn btn--ghost btn--block btn--sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Mostra meno' : `Mostra tutti (${flights.length})`}
          </button>
        )}
      </Section>
    </div>
  )
})
