import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { launchChrome, waitForChrome, type Chrome } from './chrome'

const WINDOW_FLAGS = [
  '--window-size=1280,840',
  // Linux: a taskbar entry of its own instead of being grouped with the person's browser.
  '--class=RailBook',
  // Window alerts run on timers, which Chrome otherwise slows down for windows in the background.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=Translate',
]

export interface AppWindow {
  chrome: Chrome
  targetId: string
  /** Settles when the person closes the window, or the browser exits. */
  closed: Promise<void>
  focus(): Promise<void>
  close(): Promise<void>
}

export interface WindowOptions {
  /** The server's one-time launch link. */
  url: string
  origin: string
  /** A browser profile used only by RailBook, so it doesn't touch the person's own. */
  profile: string
}

async function findPage(chrome: Chrome, origin: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { targetInfos } = await chrome.cdp.send<{ targetInfos: { targetId: string; type: string; url: string }[] }>(
      'Target.getTargets',
    )
    const page = targetInfos.find(({ type, url }) => type === 'page' && url.startsWith(origin))
    if (page) return page.targetId
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("The RailBook window didn't open.")
}

/**
 * Turns off the browser's own password saving in RailBook's profile. RailBook keeps IRCTC logins in its encrypted
 * vault, and the browser offering to save them, or the master password, would keep a second copy outside it.
 */
export async function preparePreferences(profile: string) {
  const file = path.join(profile, 'Default', 'Preferences')
  let preferences: Record<string, any> = {}
  try {
    preferences = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    // A new profile, or one the browser will rebuild.
  }
  preferences.credentials_enable_service = false
  preferences.credentials_enable_autosignin = false
  preferences.profile = { ...preferences.profile, password_manager_enabled: false }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(preferences))
}

/** Opens the UI in a browser window without tabs or an address bar, so it looks like a desktop app. */
export async function openAppWindow(executable: string, { url, origin, profile }: WindowOptions): Promise<AppWindow> {
  await preparePreferences(profile)
  const chrome = launchChrome(executable, [`--user-data-dir=${profile}`, `--app=${url}`, ...WINDOW_FLAGS])
  try {
    await waitForChrome(chrome)
    // The origin changes with the port on every launch, so grant again each time instead of asking the person.
    await chrome.cdp.send('Browser.grantPermissions', {
      origin,
      permissions: ['notifications', 'clipboardReadWrite', 'clipboardSanitizedWrite'],
    })
    const targetId = await findPage(chrome, origin)
    await chrome.cdp.send('Target.setDiscoverTargets', { discover: true })

    const closed = new Promise<void>((resolve) => {
      chrome.cdp.on('Target.targetDestroyed', (params) => {
        if (params.targetId === targetId) resolve()
      })
      void chrome.exited.then(() => resolve())
    })

    return {
      chrome,
      targetId,
      closed,
      focus: async () => {
        await chrome.cdp.send('Target.activateTarget', { targetId })
      },
      close: async () => {
        await chrome.cdp.send('Browser.close').catch(() => chrome.kill())
        await chrome.exited
      },
    }
  } catch (error) {
    chrome.kill()
    // Chrome hands over to a browser that already has this profile open, then exits.
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nIf an earlier RailBook window is still open, close it and try again.`,
    )
  }
}
