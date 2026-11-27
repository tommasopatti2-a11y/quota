import { useState } from 'react'
import { formatPrice } from '../../lib/format'
import type { Direction } from '../../lib/types'
import { LineChart } from './charts/LineChart'
import { byDaysLeft, type Criterion, CRITERION_LABEL, type Dashboard } from './model'
import { COLORS, Section, Segmented } from './ui'

export function DaysLeftSection({ d, mult, crit }: { d: Dashboard; mult: number; crit: Criterion }) {
  const [dir, setDir] = useState<Direction>('outbound')
  const pts = byDaysLeft(d, dir, crit)
  const enough = new Set(pts.map((p) => p.days)).size >= 3

  return (
    <Section title="Prezzo e giorni alla partenza" subtitle={`${CRITERION_LABEL[crit]} · media per giorni mancanti al volo`}>
      <Segmented
        label="Direzione"
        value={dir}
        onChange={setDir}
        options={[
          { value: 'outbound', label: 'Andata' },
          { value: 'return', label: 'Ritorno' },
        ]}
      />
      {enough ? (
        <LineChart
          xs={pts.map((p) => p.days)}
          xDomain={[Math.max(...pts.map((p) => p.days)), Math.min(...pts.map((p) => p.days))]}
          series={[{ key: dir, label: 'Prezzo medio', color: dir === 'outbound' ? COLORS.outbound : COLORS.return, values: pts.map((p) => p.pp * mult) }]}
          formatXTick={(x) => `${Math.round(x)} gg`}
          formatTitle={(i) => `${pts[i].days} giorni alla partenza · ${pts[i].n} ${pts[i].n === 1 ? 'prezzo' : 'prezzi'}`}
          formatY={formatPrice}
          height={190}
          ariaLabel="Prezzo medio in funzione dei giorni mancanti alla partenza"
        />
      ) : (
        <p className="muted small chart-empty">Servono rilevazioni su più giorni per vedere la tendenza.</p>
      )}
    </Section>
  )
}
