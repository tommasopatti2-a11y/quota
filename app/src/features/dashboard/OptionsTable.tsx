import { useState } from 'react'
import { formatDayWeek, formatDurationShort, formatPrice } from '../../lib/format'
import type { Direction } from '../../lib/types'
import { type Dashboard, durationOf, flightFor, historicalAvg, type LatestFlight } from './model'
import { Section, Segmented } from './ui'

const cell = (f: LatestFlight | null, mult: number, empty: string) =>
  f ? (
    <>
      {formatPrice(f.pp * mult)}
      <small>
        {f.stops === 0 ? 'diretto' : f.stops != null ? `${f.stops} sc.` : ''}
        {durationOf(f) != null && ` · ${formatDurationShort(durationOf(f))}`}
      </small>
    </>
  ) : (
    <>
      —<small>{empty}</small>
    </>
  )

export function OptionsTable({
  d,
  mult,
  dates,
  onPick,
}: {
  d: Dashboard
  mult: number
  dates: Record<Direction, string[]>
  onPick: (dir: Direction, date: string) => void
}) {
  const [dir, setDir] = useState<Direction>('outbound')
  const rows = dates[dir].map((date) => ({
    date,
    best: flightFor(d.latest, dir, date, 'best'),
    cheap: flightFor(d.latest, dir, date, 'cheap'),
    direct: flightFor(d.latest, dir, date, 'direct'),
    avg: historicalAvg(d.byDate.best[dir].get(date)),
    status: d.latestSearches.find(([x, dd]) => x === dir && dd === date)?.[2] ?? null,
  }))
  const top = rows.reduce<(typeof rows)[number] | null>(
    (b, r) => (r.best?.score != null && (!b || r.best.score < b.best!.score!) ? r : b),
    null,
  )

  return (
    <Section title="Opzioni per data" subtitle="Ultima rilevazione, prezzi a confronto · tocca una data per i voli">
      <Segmented
        label="Direzione"
        value={dir}
        onChange={setDir}
        options={[
          { value: 'outbound', label: 'Andata' },
          { value: 'return', label: 'Ritorno' },
        ]}
      />
      <table className="opt-table">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Consigliato</th>
            <th scope="col">Economico</th>
            <th scope="col">Diretto</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date} className={r === top ? 'is-best' : ''} onClick={() => onPick(dir, r.date)}>
              <th scope="row">
                <button type="button" className="opt-table__date" onClick={() => onPick(dir, r.date)}>
                  {formatDayWeek(r.date)}
                </button>
                {r === top ? (
                  <span className="badge badge--good">Migliore</span>
                ) : (
                  r.avg != null && <small>media {formatPrice(r.avg * mult)}</small>
                )}
              </th>
              {!r.best && !r.cheap ? (
                <td colSpan={3} className="faint">
                  {r.status === 'error' ? 'Non letta nell’ultima rilevazione' : r.status === 'empty' ? 'Nessun volo trovato' : 'Nessun dato'}
                </td>
              ) : (
                <>
                  <td>{cell(r.best, mult, '')}</td>
                  <td>{cell(r.cheap, mult, '')}</td>
                  <td>{cell(r.direct, mult, 'non c’è')}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
