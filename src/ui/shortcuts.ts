import { useEffect, useRef } from 'react'

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform)
/** The modifier key's name as people know it on this computer. */
export const MOD_KEY = IS_MAC ? '⌘' : 'Ctrl'

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export interface ShortcutOptions {
  /** Needs Ctrl, or ⌘ on a Mac. These also work while typing. */
  mod?: boolean
  enabled?: boolean
}

/**
 * Runs handler when key is pressed. Nothing runs while a dialog is open, so shortcuts never act behind one, and plain
 * keys are skipped while typing so they never swallow a letter. Avoid Ctrl+N, T and W: the browser keeps those.
 */
export function useShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { mod = false, enabled = true }: ShortcutOptions = {},
) {
  const latest = useRef(handler)
  latest.current = handler

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key.toLowerCase() !== key.toLowerCase()) return
      const modPressed = IS_MAC ? event.metaKey : event.ctrlKey
      if (mod !== modPressed || event.altKey) return
      if (document.querySelector('dialog[open]') || (!mod && isTyping(event.target))) return
      event.preventDefault()
      latest.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, mod, enabled])
}

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [MOD_KEY, 'K'], label: 'Search and run commands' },
  { keys: ['N'], label: 'New booking task' },
  { keys: ['1'], label: 'Go to Home' },
  { keys: ['2'], label: 'Go to Booking tasks' },
  { keys: ['3'], label: 'Go to Passengers' },
  { keys: ['4'], label: 'Go to PNR status' },
  { keys: ['5'], label: 'Go to Practice' },
  { keys: [MOD_KEY, ','], label: 'Open Settings' },
  { keys: ['/'], label: 'Search the current list' },
  { keys: [MOD_KEY, 'Enter'], label: 'Continue in a wizard or finish a session step' },
  { keys: ['Esc'], label: 'Close a dialog' },
  { keys: ['?'], label: 'Show these shortcuts' },
]
