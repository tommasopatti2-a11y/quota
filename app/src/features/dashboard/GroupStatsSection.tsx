import { useState } from 'react'
import { formatPrice } from '../../lib/format'
import type { Direction } from '../../lib/types'
import type { Dashboard, GroupStat } from './model'
import { Section, Segmented } from './ui'

const MAX_AIRLINES = 8

function StatList({ title, rows, mult }: { title: string; rows: GroupStat[]; mult: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, MAX_AIRLINES)
  if (!rows.length) return null
  return (
    <div className="stat-list">
      <div className="stat-list__head faint small">
        <span>{title}</span>
        <span>Minimo</span>
        <span>Media</span>
      </div>
      {shown.map((r) => (
        <div key={r.label} className="stat-list__row">
          <span className="stat-list__name">
            {r.label}
            <span className="faint small"> · {r.n}</span>
          </span>
          <strong>{formatPrice(r.min * mult)}</strong>
          <span className="muted">{formatPrice(r.avg * mult)}</span>
        </div>
      ))}
      {rows.length > MAX_AIRLINES && (
        <button className="link-btn" onClick={() => setAll((v) => !v)}>
          {all ? 'Mostra meno' : `Mostra tutte (${rows.length})`}
        </button>
      )}
    </div>
  )
}

export function GroupStatsSection({ d, mult }: { d: Dashboard; mult: number }) {
  const [dir, setDir] = useState<Direction>('outbound')
  return (
    <Section title={d.byRoute.outbound.length > 1 || d.byRoute.return.length > 1 ? "Aeroporti, compagnie e scali" : "Compagnie e scali"} subtitle="Su tutto lo storico · il numero indica quanti voli">
      <Segmented
        label="Direzione"
        value={dir}
        onChange={setDir}
        options={[
          { value: 'outbound', label: 'Andata' },
          { value: 'return', label: 'Ritorno' },
        ]}
      />
      {d.byRoute[dir].length > 1 && <StatList title="Aeroporti" rows={d.byRoute[dir]} mult={mult} />}
      <StatList title="Scali" rows={[...d.byStops[dir]].sort((a, b) => a.label.localeCompare(b.label))} mult={mult} />
      <StatList title="Compagnia" rows={d.byAirline[dir]} mult={mult} />
    </Section>
  )
}
