import { useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useShortcut } from './shortcuts'

// Choices are native radios and checkboxes under the styling, so keyboards and screen readers work as usual.

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  format = String,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  format?: (option: T) => string
}) {
  const name = useId()

  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option} className={option === value ? 'selected' : undefined}>
          <input type="radio" name={name} checked={option === value} onChange={() => onChange(option)} />
          {format(option)}
        </label>
      ))}
    </div>
  )
}

export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  describe,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  describe?: (option: T) => string
}) {
  const name = useId()

  return (
    <div className="chips" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option} className={option === value ? 'selected' : undefined}>
          <input type="radio" name={name} checked={option === value} onChange={() => onChange(option)} />
          <strong>{option}</strong>
          {describe && <small>{describe(option)}</small>}
        </label>
      ))}
    </div>
  )
}

export function ToggleChips<T extends string | number>({
  label,
  options,
  values,
  onChange,
  format = String,
}: {
  label: string
  options: readonly T[]
  values: readonly T[]
  onChange: (values: T[]) => void
  format?: (option: T) => string
}) {
  const toggle = (option: T) =>
    onChange(values.includes(option) ? values.filter((other) => other !== option) : [...values, option])

  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <label key={option} className={values.includes(option) ? 'selected' : undefined}>
          <input type="checkbox" checked={values.includes(option)} onChange={() => toggle(option)} />
          <strong>{format(option)}</strong>
        </label>
      ))}
    </div>
  )
}

export function Switch({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="switch-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

/** Filters the list on screen. Press / to jump to it and Escape to clear it. */
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useShortcut('/', () => input.current?.focus())

  return (
    <label className="search-field">
      <Icon name="search" size={16} />
      <input
        ref={input}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          onChange('')
          event.currentTarget.blur()
        }}
      />
      {!value && <kbd>/</kbd>}
    </label>
  )
}
