import { Link } from 'react-router-dom'
import { Switch } from '../../components/Switch'
import { isCity, type Airport } from '../../lib/airports'
import { formatDay, parseDay } from '../../lib/format'
import type { Trip } from '../../lib/types'

interface Props {
  trip: Trip
  airports: Map<string, Airport> | null
  concluded: boolean
  busy: boolean
  onToggle: (active: boolean) => void
}

const year = (iso: string) => parseDay(iso).getFullYear()

export function TripCard({ trip, airports, concluded, busy, onToggle }: Props) {
  const from = airports?.get(trip.origin)
  const to = airports?.get(trip.destination)
  const sameYear = year(trip.outbound_date) === year(trip.return_date)

  return (
    <li className={`card trip-card${trip.active ? '' : ' is-off'}`}>
      <Link to={`/dashboard/${trip.id}`} className="trip-card__link" aria-label={`Dashboard di ${trip.name}`} />
      <div className="trip-card__top">
        <span className="trip-card__name">{trip.name}</span>
        <Link to={`/viaggi/nuovo?da=${trip.id}`} className="icon-btn trip-card__edit" aria-label={`Duplica ${trip.name}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </Link>
        <Link to={`/viaggi/${trip.id}`} className="icon-btn trip-card__edit" aria-label={`Modifica ${trip.name}`}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        </Link>
        {concluded ? (
          <span className="pill">Concluso</span>
        ) : (
          <Switch
            checked={trip.active}
            busy={busy}
            onChange={onToggle}
            label={`${trip.active ? 'Disattiva' : 'Attiva'} ${trip.name}`}
          />
        )}
      </div>
      <div className="trip-card__route">
        <span>{trip.origin}</span>
        <span className="trip-card__arrow" aria-label="verso">
          →
        </span>
        <span>{trip.destination}</span>
      </div>
      {(from || to) && (
        <div className="faint small trip-card__cities">
          {from ? `${from.city}${isCity(from) ? ' (tutti)' : ''}` : trip.origin} – {to ? `${to.city}${isCity(to) ? ' (tutti)' : ''}` : trip.destination}
        </div>
      )}
      <div className="trip-card__meta small">
        <span>
          {formatDay(trip.outbound_date)}
          {sameYear ? '' : ` ${year(trip.outbound_date)}`} – {formatDay(trip.return_date)} {year(trip.return_date)}
        </span>
        <span className="dot" aria-hidden="true">·</span>
        <span>±{trip.window_days} gg</span>
        <span className="dot" aria-hidden="true">·</span>
        <span>
          {trip.passengers} {trip.passengers === 1 ? 'passeggero' : 'passeggeri'}
        </span>
      </div>
    </li>
  )
}
