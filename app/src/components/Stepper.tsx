interface Props {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  label: string
  format?: (v: number) => string
}

export function Stepper({ value, min, max, onChange, label, format }: Props) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper__btn" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Diminuisci">
        −
      </button>
      <output className="stepper__value" aria-live="polite">
        {format ? format(value) : value}
      </output>
      <button type="button" className="stepper__btn" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Aumenta">
        +
      </button>
    </div>
  )
}
