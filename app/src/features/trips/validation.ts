import type { Priority, Trip, TripInput } from '../../lib/types'

export interface TripFormValues {
  name: string
  origin: string
  destination: string
  outbound_date: string
  return_date: string
  window_days: number
  passengers: number
  priority: Priority
  active: boolean
}

export type TripFormErrors = Partial<Record<keyof TripFormValues, string>>

export const MAX_WINDOW = 7
export const MAX_PASSENGERS = 9

export const emptyForm = (): TripFormValues => ({
  name: '',
  origin: '',
  destination: '',
  outbound_date: '',
  return_date: '',
  window_days: 2,
  passengers: 1,
  priority: 'equilibrio',
  active: true,
})

export const formFromTrip = (t: Trip): TripFormValues => ({
  name: t.name,
  origin: t.origin,
  destination: t.destination,
  outbound_date: t.outbound_date,
  return_date: t.return_date,
  window_days: t.window_days,
  passengers: t.passengers,
  priority: t.priority ?? 'equilibrio',
  active: t.active,
})

const normName = (s: string) => s.trim().toLowerCase()

export function validateTrip(
  v: TripFormValues,
  ctx: { trips: Trip[]; editingId?: string; today: string; originalOutbound?: string },
): TripFormErrors {
  const e: TripFormErrors = {}

  if (!v.name.trim()) e.name = 'Inserisci un nome.'
  else if (v.name.trim().length > 80) e.name = 'Massimo 80 caratteri.'
  else if (ctx.trips.some((t) => t.id !== ctx.editingId && normName(t.name) === normName(v.name)))
    e.name = 'Esiste già un viaggio con questo nome.'

  if (!/^[A-Z]{3}$/.test(v.origin)) e.origin = 'Codice IATA di 3 lettere.'
  if (!/^[A-Z]{3}$/.test(v.destination)) e.destination = 'Codice IATA di 3 lettere.'
  else if (v.destination === v.origin) e.destination = 'Deve essere diversa dalla partenza.'

  if (!v.outbound_date) e.outbound_date = 'Scegli la data di andata.'
  // Una data di andata passata è ammessa solo se non è stata modificata (viaggio già esistente).
  else if (v.outbound_date < ctx.today && v.outbound_date !== ctx.originalOutbound)
    e.outbound_date = 'La data di andata è già passata.'

  if (!v.return_date) e.return_date = 'Scegli la data di ritorno.'
  else if (v.outbound_date && v.return_date <= v.outbound_date) e.return_date = 'Deve essere successiva all’andata.'

  if (!Number.isInteger(v.window_days) || v.window_days < 0 || v.window_days > MAX_WINDOW)
    e.window_days = `Un numero intero tra 0 e ${MAX_WINDOW}.`
  if (!Number.isInteger(v.passengers) || v.passengers < 1 || v.passengers > MAX_PASSENGERS)
    e.passengers = `Da 1 a ${MAX_PASSENGERS} passeggeri.`

  return e
}

export const toInput = (v: TripFormValues): TripInput => ({
  name: v.name.trim().replace(/\s+/g, ' '),
  origin: v.origin.trim().toUpperCase(),
  destination: v.destination.trim().toUpperCase(),
  outbound_date: v.outbound_date,
  return_date: v.return_date,
  window_days: v.window_days,
  passengers: v.passengers,
  priority: v.priority,
  active: v.active,
})

/** Numero di ricerche per rilevazione: (2·finestra + 1) date × 2 direzioni. */
export const searchesPerRun = (windowDays: number) => (2 * windowDays + 1) * 2
