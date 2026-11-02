import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { initials } from '../core/format'
import { Icon, type IconName } from './Icon'

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string
  subtitle?: string
  /** A path, or a handler for flows with their own back step. */
  back?: string | (() => void)
  actions?: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <header className="page-header">
      {back && (
        <button
          type="button"
          className="icon-button"
          aria-label="Back"
          onClick={() => (typeof back === 'string' ? navigate(back) : back())}
        >
          <Icon name="back" />
        </button>
      )}
      <div className="page-title">
        <h1>{title}</h1>
        {subtitle && <small>{subtitle}</small>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action}
    </div>
  )
}

/** A bottom sheet on a native dialog, which handles focus, Escape and the back gesture. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={onClose}
      // A click on the dialog itself, outside its body, is a click on the backdrop.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      {open && (
        <div className="sheet-body">
          <header className="sheet-header">
            <h2>{title}</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Sheet open={open} title={title} onClose={onClose}>
      <p className="muted">{body}</p>
      <div className="button-row">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="button danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h2>{title}</h2>
      {children && <p className="muted">{children}</p>}
      {action}
    </section>
  )
}

export type Tone = 'info' | 'live' | 'success' | 'danger' | 'muted'

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`status-chip ${tone}`}>{children}</span>
}

const AVATAR_HUES = [212, 262, 330, 24, 152, 188]

export function Avatar({ id, name }: { id: string; name: string }) {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0
  const hue = AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length]

  return (
    <span className="avatar" style={{ '--hue': hue } as CSSProperties} aria-hidden="true">
      {initials(name)}
    </span>
  )
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <span style={{ width: `${value * 100}%` }} />
    </div>
  )
}

export function Notice({ icon = 'info', children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="notice">
      <Icon name={icon} size={18} />
      <p>{children}</p>
    </div>
  )
}
