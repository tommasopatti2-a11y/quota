interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
  busy?: boolean
}

/** Interruttore accessibile (role="switch"), area di tocco 48px. */
export function Switch({ checked, onChange, label, disabled, busy }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch${checked ? ' is-on' : ''}${busy ? ' is-busy' : ''}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
    >
      <span className="switch__thumb" />
    </button>
  )
}
