// Formattazione in italiano, ora locale del dispositivo (Europe/Rome).

// useGrouping 'always': in italiano i numeri di 4 cifre altrimenti non hanno il punto (7448 → 7.448).
const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions)
const shortDate = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const formatPrice = (v: number | null | undefined) => (v == null ? '—' : eur.format(v))

/** Date "YYYY-MM-DD" interpretate come date di calendario (senza fuso). */
export const parseDay = (d: string) => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day)
}
export const formatDay = (d: string) => shortDate.format(parseDay(d))
export const formatDayLong = (d: string) => longDate.format(parseDay(d))
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

export const formatDuration = (min: number | null | undefined) => {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Oggi come "YYYY-MM-DD" nel fuso del dispositivo. */
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const weekDay = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
/** "sab 11 lug" */
export const formatDayWeek = (d: string) => weekDay.format(parseDay(d)).replace(',', '')
const dayOnly = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })
export const formatShortDate = (ms: number) => dayOnly.format(new Date(ms))

/** "2h45", "12h", "45 min" */
export const formatDurationShort = (min: number | null | undefined) => {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Differenza di durata con segno: "+5h20", "−20 min". */
export const formatDurationDelta = (min: number) => `${min < 0 ? '−' : '+'}${formatDurationShort(Math.abs(Math.round(min)))}`
