import { formatDateTime, formatDayWeek, formatDurationDelta, formatDurationShort, formatPrice } from '../../lib/format'
import { type Criterion, CRITERIA, CRITERION_LABEL, type Dashboard, durationOf, flightFor, minWithIndex, previous } from './model'
import { Delta } from './ui'

interface Summary {
  total: number | null
  outDate?: string
  retDate?: string
  dur: number | null // durata andata + ritorno
  stops: number | null // scali massimi tra andata e ritorno
  outDur: number | null
  retDur: number | null
}

function summarize(d: Dashboard, crit: Criterion): Summary {
  const p = d.points[crit][d.lastIdx]
  if (!p?.out || !p.ret) return { total: null, dur: null, stops: null, outDur: null, retDur: null }
  const fo = flightFor(d.latest, 'outbound', p.out.date, crit)
  const fr = flightFor(d.latest, 'return', p.ret.date, crit)
  const outDur = fo ? durationOf(fo) : null
  const retDur = fr ? durationOf(fr) : null
  return {
    total: p.total,
    outDate: p.out.date,
    retDate: p.ret.date,
    outDur,
    retDur,
    dur: outDur != null && retDur != null ? outDur + retDur : null,
    stops: fo?.stops != null && fr?.stops != null ? Math.max(fo.stops, fr.stops) : null,
  }
}

const stopsText = (s: number | null) => (s == null ? '' : s === 0 ? 'diretto' : s === 1 ? '1 scalo' : `${s} scali`)

export function OptionCards({ d, mult, value, onChange }: { d: Dashboard; mult: number; value: Criterion; onChange: (c: Criterion) => void }) {
  const sums = Object.fromEntries(CRITERIA.map((c) => [c, summarize(d, c)])) as Record<Criterion, Summary>
  const ref = sums.best
  const sel = sums[value]
  const values = d.points[value].map((x) => x.total)
  const prev = previous(values, d.lastIdx)
  const histMin = minWithIndex(values)
  const run = d.runs[d.lastIdx]
  const latestRun = d.runs[d.runs.length - 1]
  const missing = run.total - run.ok - run.empty

  const compare = (c: Criterion) => {
    const s = sums[c]
    if (c === 'best' || s.total == null || ref.total == null) return null
    const dp = (s.total - ref.total) * mult
    const dd = s.dur != null && ref.dur != null ? s.dur - ref.dur : null
    if (Math.abs(dp) < 1 && (dd == null || Math.abs(dd) < 5)) return '= consigliato'
    const price = `${dp < 0 ? '−' : '+'}${formatPrice(Math.abs(dp))}`
    if (dd == null || Math.abs(dd) < 5) return price
    return dp < 0 ? `${price} ma ${formatDurationDelta(dd)}` : `${price} per ${formatDurationDelta(dd)}`
  }

  return (
    <>
      <div className="opts" role="radiogroup" aria-label="Criterio di scelta">
        {CRITERIA.map((c) => {
          const s = sums[c]
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === value}
              className={`opt${c === value ? ' is-on' : ''}`}
              onClick={() => onChange(c)}
            >
              <span className="opt__label">
                {c === 'best' && '★ '}
                {CRITERION_LABEL[c]}
              </span>
              <strong className="opt__value">{s.total != null ? formatPrice(s.total * mult) : '—'}</strong>
              <span className="opt__sub">
                {s.total == null
                  ? c === 'direct'
                    ? 'Nessun diretto'
                    : 'Non disponibile'
                  : `${stopsText(s.stops)}${s.outDur != null ? ` · ${formatDurationShort(s.outDur)} + ${formatDurationShort(s.retDur)}` : ''}`}
              </span>
              {c === 'best' && s.total != null && prev && c === value ? (
                <Delta now={s.total * mult} before={d.points.best[prev.idx].total! * mult} />
              ) : (
                compare(c) && <span className="opt__cmp">{compare(c)}</span>
              )}
            </button>
          )
        })}
      </div>
      <p className="kpi-foot faint small">
        {sel.outDate && sel.retDate && (
          <>
            {formatDayWeek(sel.outDate)} + {formatDayWeek(sel.retDate)}
            {' · '}
          </>
        )}
        {value !== 'best' && sel.total != null && prev && (
          <>
            <Delta now={sel.total * mult} before={prev.value * mult} suffix=" da prima" />
            {' · '}
          </>
        )}
        {histMin &&
          (histMin.idx === d.lastIdx ? (
            <span className="badge badge--good">Minimo storico</span>
          ) : (
            <>minimo storico {formatPrice(histMin.value * mult)} ({formatDateTime(d.runs[histMin.idx].at)})</>
          ))}
        <br />
        Ultima rilevazione {formatDateTime(run.at)} · {run.ok + run.empty} date su {run.total}
        {missing > 0 && <span className="warn-text"> · {missing} non disponibili</span>}
        {latestRun.idx !== d.lastIdx && (
          <span className="warn-text"> · la rilevazione del {formatDateTime(latestRun.at)} non ha trovato prezzi</span>
        )}
      </p>
    </>
  )
}
