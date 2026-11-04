const CLEAR_SECRETS_AFTER_MS = 30_000

export function copyText(text: string) {
  return navigator.clipboard.writeText(text)
}

/**
 * Copies a password, then wipes it from the clipboard 30 seconds later if it's still there. Reading the clipboard
 * needs RailBook's window in front, so when it isn't, the check waits until the window comes back.
 */
export async function copySecret(text: string) {
  await navigator.clipboard.writeText(text)
  const clear = async () => {
    try {
      if ((await navigator.clipboard.readText()) === text) await navigator.clipboard.writeText('')
      return true
    } catch {
      return false
    }
  }
  setTimeout(() => {
    void clear().then((done) => {
      if (!done) window.addEventListener('focus', () => void clear(), { once: true })
    })
  }, CLEAR_SECRETS_AFTER_MS)
}
