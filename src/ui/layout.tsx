import { Fragment, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { initials } from '../core/format'
import { Icon, type IconName } from './Icon'

/** Names the window after the screen, which is what shows in the taskbar and window switcher. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · RailBook` : 'RailBook'
  }, [title])
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  windowTitle,
}: {
  title: string
  /** Use when the heading is chatty, like a greeting. */
  windowTitle?: string
  subtitle?: ReactNode
  /** Where this screen sits, e.g. Booking tasks › this task. */
  breadcrumbs?: { label: string; to: string }[]
  actions?: ReactNode
}) {
  useDocumentTitle(windowTitle ?? title)

  return (
    <header className="page-header">
      <div className="page-title">
        {breadcrumbs && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map(({ label, to }) => (
              <Fragment key={to}>
                <Link to={to}>{label}</Link>
                <Icon name="chevron" size={14} />
              </Fragment>
            ))}
          </nav>
        )}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="muted">{description}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * A centred modal on a native dialog, which handles focus, Escape and stacking. It renders into the body, so a dialog
 * opened from inside a form doesn't nest one form in another.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  size = 'normal',
  children,
}: {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  footer?: ReactNode
  size?: 'small' | 'normal' | 'wide'
  children?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal focuses the first control, usually the close button, so move to the one meant to start.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return createPortal(
    <dialog
      ref={ref}
      className={`dialog ${size}`}
      onClose={onClose}
      // A click on the dialog itself, outside its body, is a click on the backdrop.
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {open && (
        <div className="dialog-body">
          <header className="dialog-header">
            <div>
              <h2>{title}</h2>
              {description && <p className="muted">{description}</p>}
            </div>
            <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>
          {children}
          {footer && <footer className="dialog-footer">{footer}</footer>}
        </div>
      )}
    </dialog>,
    document.body,
  )
}

export function ConfirmDialog({
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
    <Dialog
      open={open}
      title={title}
      description={body}
      size="small"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button danger" data-autofocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
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
        <Icon name={icon} size={26} />
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

export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0
  const hue = AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length]

  return (
    <span className="avatar" style={{ '--hue': hue, '--size': `${size}px` } as CSSProperties} aria-hidden="true">
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
      <Icon name={icon} size={16} />
      <p>{children}</p>
    </div>
  )
}

export function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keys">
      {keys.map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </span>
  )
}
