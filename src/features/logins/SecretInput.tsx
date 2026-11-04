import { useState } from 'react'
import { Icon } from '../../ui/Icon'

/** A password field with a show/hide toggle. */
export function SecretInput({
  label,
  value,
  onChange,
  autoComplete,
  required = false,
  autoFocus = false,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  required?: boolean
  autoFocus?: boolean
  disabled?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <span className="secret-input">
        <input
          type={shown ? 'text' : 'password'}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          spellCheck={false}
          data-autofocus={autoFocus || undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="icon-button"
          disabled={disabled}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={shown ? 'Hide' : 'Show'}
          onClick={() => setShown(!shown)}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </span>
    </label>
  )
}
