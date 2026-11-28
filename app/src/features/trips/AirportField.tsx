import { useId, useMemo, useState } from 'react'
import { countryName, isCity, searchAirports, type Airport } from '../../lib/airports'
import { useAirports } from '../../lib/useAirports'

interface Props {
  label: string
  value: string // codice IATA o ''
  onChange: (code: string) => void
  error?: string
  placeholder?: string
}

const describe = (a: Airport) =>
  isCity(a)
    ? `${a.city} · tutti gli aeroporti (${a.airports!.join(', ')}) · ${countryName(a.country)}`
    : `${a.city} · ${a.name} · ${countryName(a.country)}`

export function AirportField({ label, value, onChange, error, placeholder }: Props) {
  const airports = useAirports()
  const id = useId()
  const [text, setText] = useState(value)
  const [focused, setFocused] = useState(false)

  const suggestions = useMemo(
    () => (airports && focused && text.trim().length >= 2 && text !== value ? searchAirports(airports, text, 7) : []),
    [airports, focused, text, value],
  )
  const selected = value ? airports?.get(value) : undefined

  const pick = (a: Airport) => {
    setText(a.code)
    onChange(a.code)
    setFocused(false)
  }

  const onText = (t: string) => {
    setText(t)
    const code = t.trim().toUpperCase()
    onChange(/^[A-Z]{3}$/.test(code) ? code : '')
  }

  return (
    <div className="field airport">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        value={focused ? text : value || text}
        onChange={(e) => onText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder ?? 'Città o codice, es. Roma o FCO'}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={`${id}-list`}
        aria-invalid={Boolean(error)}
      />
      {suggestions.length > 0 && (
        <ul className="airport__list" id={`${id}-list`} role="listbox">
          {suggestions.map((a) => {
            const city = isCity(a)
            // Aeroporto che appartiene a una città mostrata subito sopra: rientrato.
            const child = !city && suggestions.some((c) => isCity(c) && c.airports!.includes(a.code))
            return (
              <li key={a.code} role="option" aria-selected={a.code === value} className={child ? 'airport__child' : undefined}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)}>
                  <span className={`airport__code${city ? ' airport__code--city' : ''}`}>{a.code}</span>
                  <span className="airport__desc">
                    <span>{city ? `${a.city} · tutti gli aeroporti` : a.city || a.name}</span>
                    <span className="faint small">
                      {city ? `${a.airports!.join(', ')} · ${countryName(a.country)}` : `${a.name} · ${countryName(a.country)}`}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error ? (
        <span className="field__error">{error}</span>
      ) : selected ? (
        <span className="field__hint">{describe(selected)}</span>
      ) : value && airports ? (
        <span className="field__hint field__hint--warn">Codice non presente nell'elenco: verifica che sia corretto.</span>
      ) : null}
    </div>
  )
}
