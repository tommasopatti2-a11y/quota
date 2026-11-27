import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { linear, niceTicks } from './scale'

export interface LineSeries {
  key: string
  label: string
  color: string
  values: (number | null)[]
  muted?: boolean // serie di contesto, grigia e sottile
}

interface Props {
  xs: number[]
  series: LineSeries[]
  formatXTick: (x: number) => string
  formatTitle: (i: number) => string
  formatY: (v: number) => string
  formatYTick?: (v: number) => string
  /** Dominio X esplicito, es. [120, 0] per un conto alla rovescia. */
  xDomain?: [number, number]
  height?: number
  ariaLabel: string
}

const M = { top: 14, right: 14, bottom: 28, left: 52 }

/**
 * Grafico a linee in SVG, pensato per il touch:
 * - i valori null interrompono la linea (nessuno zero fittizio, nessun ponte sui buchi);
 * - i punti isolati tra due buchi sono mostrati come pallini;
 * - trascinando il dito (o con le frecce) un mirino verticale mostra tutti i valori in quel punto.
 */
export function LineChart({ xs, series, formatXTick, formatTitle, formatY, formatYTick, xDomain, height = 220, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Se cambiano i dati il mirino si azzera.
  useEffect(() => setActive(null), [xs, series.length])

  const geo = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v != null))
    const lo = Math.min(...all)
    const hi = Math.max(...all)
    const pad = (hi - lo) * 0.08 || hi * 0.05 || 1
    const yt = niceTicks(Math.max(0, lo - pad), hi + pad, 4)
    const y0 = yt[0] ?? 0
    const y1 = yt[yt.length - 1] ?? 1
    const [d0, d1] = xDomain ?? [Math.min(...xs), Math.max(...xs)]
    const x = linear(d0, d1, M.left, width - M.right)
    const y = linear(y0, y1, height - M.bottom, M.top)
    const tickCount = Math.max(2, Math.min(5, Math.floor((width - M.left) / 80)))
    const xt = d0 === d1 ? [d0] : Array.from({ length: tickCount }, (_, i) => d0 + ((d1 - d0) * i) / (tickCount - 1))
    return { x, y, yt, xt }
  }, [series, xs, xDomain, width, height])

  const px = xs.map((v) => geo.x(v))

  const nearest = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const mx = clientX - rect.left
    let bi = 0
    px.forEach((p, i) => {
      if (Math.abs(p - mx) < Math.abs(px[bi] - mx)) bi = i
    })
    return bi
  }
  const onPointer = (e: PointerEvent) => setActive(nearest(e.clientX))
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const dir = (e.key === 'ArrowRight') === (geo.x(xs[xs.length - 1] ?? 0) >= geo.x(xs[0] ?? 0)) ? 1 : -1
      setActive((a) => Math.min(xs.length - 1, Math.max(0, (a ?? (dir > 0 ? -1 : xs.length)) + dir)))
    } else if (e.key === 'Escape') setActive(null)
  }

  const segments = (s: LineSeries) => {
    const segs: string[] = []
    const dots: number[] = []
    let cur: string[] = []
    s.values.forEach((v, i) => {
      if (v == null) {
        if (cur.length === 1) dots.push(i - 1)
        if (cur.length > 1) segs.push('M' + cur.join('L'))
        cur = []
      } else cur.push(`${px[i].toFixed(1)},${geo.y(v).toFixed(1)}`)
    })
    if (cur.length === 1) dots.push(s.values.length - 1)
    if (cur.length > 1) segs.push('M' + cur.join('L'))
    return { segs, dots }
  }

  const lastIdx = (s: LineSeries) => {
    for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] != null) return i
    return -1
  }

  const tipX = active != null ? px[active] : 0
  const tipLeft = Math.min(Math.max(tipX - 80, 0), width - 160)

  return (
    <div
      ref={ref}
      className="chart"
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={ariaLabel}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
    >
      <svg width={width} height={height} aria-hidden="true">
        {geo.yt.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={geo.y(t)} y2={geo.y(t)} className="chart__grid" />
            <text x={M.left - 8} y={geo.y(t)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
              {(formatYTick ?? formatY)(t)}
            </text>
          </g>
        ))}
        {geo.xt.map((t, i) => (
          <text
            key={i}
            x={geo.x(t)}
            y={height - 8}
            className="chart__tick"
            textAnchor={i === 0 ? 'start' : i === geo.xt.length - 1 ? 'end' : 'middle'}
          >
            {formatXTick(t)}
          </text>
        ))}

        {[...series].sort((a, b) => Number(!a.muted) - Number(!b.muted)).map((s) => {
          const { segs, dots } = segments(s)
          const li = lastIdx(s)
          return (
            <g key={s.key} className={s.muted ? 'chart__series--muted' : undefined}>
              {segs.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={s.muted ? 1.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {dots.map((i) => (
                <circle key={i} cx={px[i]} cy={geo.y(s.values[i]!)} r={s.muted ? 3 : 4} fill={s.color} />
              ))}
              {!s.muted && li >= 0 && (
                <circle cx={px[li]} cy={geo.y(s.values[li]!)} r={4.5} fill={s.color} className="chart__ring" />
              )}
            </g>
          )
        })}

        {active != null && (
          <g>
            <line x1={tipX} x2={tipX} y1={M.top - 6} y2={height - M.bottom} className="chart__crosshair" />
            {series.map((s) =>
              s.values[active] != null ? (
                <circle key={s.key} cx={tipX} cy={geo.y(s.values[active]!)} r={5} fill={s.color} className="chart__ring" />
              ) : null,
            )}
          </g>
        )}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onPointer}
          onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && onPointer(e)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        />
      </svg>

      {active != null && (
        <div className="chart__tip" style={{ left: tipLeft }}>
          <div className="chart__tip-title">{formatTitle(active)}</div>
          {series.map((s) => (
            <div key={s.key} className="chart__tip-row">
              <span className="chart__key" style={{ background: s.color }} />
              <strong>{s.values[active] != null ? formatY(s.values[active]!) : 'n.d.'}</strong>
              <span className="faint">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
