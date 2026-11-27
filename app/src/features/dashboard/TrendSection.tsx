import { useMemo, useState } from 'react'
import { formatDateTime, formatDayWeek, formatPrice, formatShortDate } from '../../lib/format'
import type { Direction } from '../../lib/types'
import { LineChart, type LineSeries } from './charts/LineChart'
import { type Criterion, CRITERION_LABEL, type Dashboard } from './model'
import { Chips, COLORS, Section, Segmented } from './ui'

type Mode = Direction | 'total'

export function TrendSection({ d, mult, dates, crit }: { d: Dashboard; mult: number; dates: Record<Direction, string[]>; crit: Criterion }) {
  const [mode, setMode] = useState<Mode>('total')
  const [date, setDate] = useState<string>('all')

  const series: LineSeries[] = useMemo(() => {
    const m = (v: number | null) => (v == null ? null : v * mult)
    const pts = d.points[crit]
    const label = CRITERION_LABEL[crit]
    // Riferimento grigio: il più economico (se il criterio è un altro).
    const context = (values: (number | null)[]): LineSeries[] =>
      crit === 'cheap' ? [] : [{ key: 'ctx', label: 'Più economico', color: COLORS.context, values, muted: true }]
    if (mode === 'total') {
      return [
        ...context(d.points.cheap.map((p) => m(p.total))),
        { key: 'total', label, color: COLORS.total, values: pts.map((p) => m(p.total)) },
      ]
    }
    const color = mode === 'outbound' ? COLORS.outbound : COLORS.return
    const pick = (p: (typeof pts)[number]) => (mode === 'outbound' ? p.out : p.ret)?.pp ?? null
    if (date === 'all')
      return [...context(d.points.cheap.map((p) => m(pick(p)))), { key: 'min', label, color, values: pts.map((p) => m(pick(p))) }]
    const values = (d.byDate[crit][mode].get(date) ?? d.runs.map(() => null)).map(m)
    return [
      { key: 'ctx', label: `${label}, tutte le date`, color: COLORS.context, values: pts.map((p) => m(pick(p))), muted: true },
      { key: date, label: `${label}, ${formatDayWeek(date)}`, color, values },
    ]
  }, [d, mode, date, mult, crit])

  const hasGaps = series.some((s) => !s.muted && s.values.some((v) => v == null))
  const xs = d.runs.map((r) => r.time)

  return (
    <Section title="Andamento dei prezzi" subtitle={`${CRITERION_LABEL[crit]} · a ogni rilevazione`}>
      <Segmented
        label="Direzione"
        value={mode}
        onChange={(v) => {
          setMode(v)
          setDate('all')
        }}
        options={[
          { value: 'total', label: 'Totale A/R' },
          { value: 'outbound', label: 'Andata' },
          { value: 'return', label: 'Ritorno' },
        ]}
      />
      {mode !== 'total' && (
        <Chips
          label="Data del volo"
          value={date}
          onChange={setDate}
          options={[{ value: 'all', label: 'Tutte le date' }, ...dates[mode].map((x) => ({ value: x, label: formatDayWeek(x) }))]}
        />
      )}
      {d.runs.length < 2 ? (
        <p className="muted small chart-empty">Il grafico comparirà dalla seconda rilevazione.</p>
      ) : (
        <LineChart
          xs={xs}
          series={series}
          formatXTick={formatShortDate}
          formatTitle={(i) => formatDateTime(d.runs[i].at)}
          formatY={formatPrice}
          ariaLabel="Andamento del prezzo minimo nel tempo"
        />
      )}
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.key}>
              <span className="legend__line" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      )}
      {hasGaps && <p className="faint small">Le interruzioni indicano rilevazioni in cui la data non è stata letta.</p>}
    </Section>
  )
}
