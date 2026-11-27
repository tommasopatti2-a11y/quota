import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Stepper } from '../../components/Stepper'
import { Switch } from '../../components/Switch'
import { ErrorState, Spinner } from '../../components/States'
import { useToast } from '../../components/Toast'
import { formatDay, todayISO } from '../../lib/format'
import type { Trip } from '../../lib/types'
import { AirportField } from './AirportField'
import { Segmented } from '../dashboard/ui'
import type { Priority } from '../../lib/types'
import { tripErrorMessage, useDeleteTrip, useSaveTrip, useTrips } from './api'
import {
  emptyForm,
  formFromTrip,
  MAX_PASSENGERS,
  MAX_WINDOW,
  searchesPerRun,
  toInput,
  validateTrip,
  type TripFormErrors,
  type TripFormValues,
} from './validation'

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

const windowHint = (iso: string, w: number) =>
  !iso ? null : w === 0 ? `Solo ${art('il', formatDay(iso))}` : `${cap(art('dal', formatDay(addDays(iso, -w))))} ${art('al', formatDay(addDays(iso, w)))}`

// "dal 8" → "dall'8", "il 11" → "l'11"
const art = (prep: 'il' | 'dal' | 'al', day: string) =>
  /^(8|11)\b/.test(day) ? `${prep === 'il' ? 'l' : prep === 'dal' ? 'dall' : 'all'}'${day}` : `${prep} ${day}`
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

const PRIORITY_HINT: Record<Priority, string> = {
  risparmio: 'Conta quasi solo il prezzo: un volo più lungo va bene se costa meno.',
  equilibrio: 'Prezzo e tempo pesano in modo simile: pochi euro in più per un diretto ne valgono la pena.',
  comodita: 'Meglio pagare qualcosa in più per meno ore di viaggio e meno scali.',
}

export function TripFormScreen() {
  const { id } = useParams()
  const { data: trips, isPending, isError, refetch } = useTrips()

  if (isPending) return <Spinner />
  if (isError) return <ErrorState onRetry={() => refetch()} />

  const trip = id ? trips.find((t) => t.id === id) : undefined
  if (id && !trip) return <ErrorState message="Questo viaggio non esiste più." />

  // key: il form si reinizializza se si passa da un viaggio all'altro.
  return <TripForm key={trip?.id ?? 'new'} trip={trip} trips={trips} />
}

function TripForm({ trip, trips }: { trip?: Trip; trips: Trip[] }) {
  const navigate = useNavigate()
  const toast = useToast()
  const save = useSaveTrip()
  const del = useDeleteTrip()
  const today = todayISO()
  const editing = Boolean(trip)

  const [values, setValues] = useState<TripFormValues>(() => (trip ? formFromTrip(trip) : emptyForm()))
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const errors: TripFormErrors = useMemo(
    () => validateTrip(values, { trips, editingId: trip?.id, today, originalOutbound: trip?.outbound_date }),
    [values, trips, trip, today],
  )
  const shown = submitted ? errors : {}
  const set = <K extends keyof TripFormValues>(k: K, v: TripFormValues[K]) => setValues((s) => ({ ...s, [k]: v }))

  const changed = (k: keyof TripFormValues) => trip != null && values[k] !== formFromTrip(trip)[k]
  const routeOrDatesChanged =
    changed('origin') || changed('destination') || changed('outbound_date') || changed('return_date') || changed('window_days')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (Object.keys(errors).length) return
    try {
      await save.mutateAsync({ id: trip?.id, input: toInput(values) })
      toast(editing ? 'Modifiche salvate' : 'Viaggio creato', 'success')
      if (editing) navigate(-1)
      else navigate('/viaggi', { replace: true })
    } catch (err) {
      setServerError(tripErrorMessage(err))
    }
  }

  const onDelete = async () => {
    if (!trip) return
    try {
      await del.mutateAsync(trip.id)
      toast('Viaggio eliminato', 'success')
      navigate('/viaggi', { replace: true })
    } catch (err) {
      setConfirmDelete(false)
      toast(tripErrorMessage(err), 'error')
    }
  }

  const n = searchesPerRun(values.window_days)

  return (
    <form className="form-screen" onSubmit={onSubmit} noValidate>
      <header className="form-screen__header">
        <button type="button" className="icon-btn" onClick={() => navigate(-1)} aria-label="Indietro">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1>{editing ? 'Modifica viaggio' : 'Nuovo viaggio'}</h1>
      </header>

      <section className="card stack">
        <label className="field">
          <span className="field__label">Nome del viaggio</span>
          <input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Es. Estate Sydney"
            maxLength={80}
            aria-invalid={Boolean(shown.name)}
          />
          {shown.name ? (
            <span className="field__error">{shown.name}</span>
          ) : (
            changed('name') && <span className="field__hint">Lo storico delle rilevazioni resta collegato al viaggio.</span>
          )}
        </label>

        <AirportField label="Partenza" value={values.origin} onChange={(c) => set('origin', c)} error={shown.origin} />
        <AirportField label="Destinazione" value={values.destination} onChange={(c) => set('destination', c)} error={shown.destination} />
      </section>

      <section className="card stack">
        <div className="grid-2">
          <label className="field">
            <span className="field__label">Andata</span>
            <input
              type="date"
              value={values.outbound_date}
              min={editing ? undefined : today}
              onChange={(e) => set('outbound_date', e.target.value)}
              aria-invalid={Boolean(shown.outbound_date)}
            />
          </label>
          <label className="field">
            <span className="field__label">Ritorno</span>
            <input
              type="date"
              value={values.return_date}
              min={values.outbound_date || today}
              onChange={(e) => set('return_date', e.target.value)}
              aria-invalid={Boolean(shown.return_date)}
            />
          </label>
        </div>
        {(shown.outbound_date || shown.return_date) && (
          <span className="field__error">{shown.outbound_date ?? shown.return_date}</span>
        )}

        <div className="field">
          <span className="field__label">Finestra di date flessibili</span>
          <div className="row-between">
            <Stepper
              label="Finestra in giorni"
              value={values.window_days}
              min={0}
              max={MAX_WINDOW}
              onChange={(v) => set('window_days', v)}
              format={(v) => `±${v} gg`}
            />
            <span className="muted small right">
              {windowHint(values.outbound_date, values.window_days) ?? 'Giorni prima e dopo ogni data'}
            </span>
          </div>
          <span className="field__hint">
            {n} ricerche per rilevazione, circa {Math.ceil((n * 9) / 60)} min di GitHub Actions.
          </span>
        </div>

        <div className="field">
          <span className="field__label">Passeggeri</span>
          <div className="row-between">
            <Stepper
              label="Numero di passeggeri"
              value={values.passengers}
              min={1}
              max={MAX_PASSENGERS}
              onChange={(v) => set('passengers', v)}
            />
            <span className="muted small right">{values.passengers === 1 ? 'Adulto' : 'Adulti'}, classe economy</span>
          </div>
          {changed('passengers') && (
            <span className="field__hint field__hint--warn">
              I prezzi già raccolti si riferiscono a {trip!.passengers} {trip!.passengers === 1 ? 'passeggero' : 'passeggeri'}: nei
              confronti useremo il prezzo a persona.
            </span>
          )}
        </div>
      </section>

      <section className="card stack">
        <div className="field">
          <span className="field__label">Priorità nella scelta del volo</span>
          <Segmented
            label="Priorità"
            value={values.priority}
            onChange={(v: Priority) => set('priority', v)}
            options={[
              { value: 'risparmio', label: 'Risparmio' },
              { value: 'equilibrio', label: 'Equilibrio' },
              { value: 'comodita', label: 'Comodità' },
            ]}
          />
          <span className="field__hint">{PRIORITY_HINT[values.priority]}</span>
        </div>
      </section>

      <section className="card row-between">
        <div>
          <p>Monitoraggio attivo</p>
          <p className="muted small">Incluso nelle rilevazioni giornaliere</p>
        </div>
        <Switch checked={values.active} onChange={(v) => set('active', v)} label="Monitoraggio attivo" />
      </section>

      {routeOrDatesChanged && (
        <p className="note">Le rilevazioni già raccolte restano nello storico con le date e la tratta di allora.</p>
      )}
      {serverError && (
        <p className="form-error" role="alert">
          {serverError}
        </p>
      )}

      {editing && (
        <section className="danger-zone">
          {trip!.active ? (
            <p className="muted small">Per eliminare il viaggio, prima disattivalo.</p>
          ) : (
            <button type="button" className="btn btn--danger btn--block" onClick={() => setConfirmDelete(true)}>
              Elimina viaggio
            </button>
          )}
        </section>
      )}

      <div className="form-screen__actions">
        <button className="btn btn--primary btn--block" disabled={save.isPending}>
          {save.isPending ? 'Salvataggio…' : editing ? 'Salva modifiche' : 'Crea viaggio'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare il viaggio?"
        confirmLabel="Elimina"
        tone="danger"
        busy={del.isPending}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      >
        «{trip?.name}» e tutto il suo storico di prezzi verranno cancellati. L'operazione non si può annullare.
      </ConfirmDialog>
    </form>
  )
}
