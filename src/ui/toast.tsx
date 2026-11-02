import { createContext, use, useCallback, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

type ShowToast = (message: string, action?: Toast['action']) => void

const ToastContext = createContext<ShowToast | null>(null)
const SHOW_FOR_MS = 6000
let nextId = 1

/** Brief messages in the corner, with an optional action such as Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), [])
  const show = useCallback<ShowToast>(
    (message, action) => {
      const id = nextId++
      // Keep the last three, so a burst of actions doesn't cover the window.
      setToasts((all) => [...all.slice(-2), { id, message, action }])
      setTimeout(() => dismiss(id), SHOW_FOR_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.run()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}

export function useToast() {
  const show = use(ToastContext)
  if (!show) throw new Error('useToast needs a ToastProvider')
  return show
}
