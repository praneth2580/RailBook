import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import packageJson from '../package.json'
import { findChrome } from './chrome'
import { claimInstance, focusRunningInstance, releaseInstance } from './instance'
import { createScrapingEngine } from './scraping/engine'
import { startServer } from './server'
import { openStore } from './store'
import { dataDirectory, openExternal, openFolder } from './system'
import type { UiHandler } from './ui'
import { openAppWindow, type AppWindow } from './window'

/** Writes to the console and to railbook.log, which is the only place to look when there's no console. */
export function log(message: string) {
  const directory = dataDirectory()
  console.log(message)
  try {
    mkdirSync(directory, { recursive: true })
    appendFileSync(path.join(directory, 'railbook.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // Logging must never stop the app.
  }
}

export interface StartOptions {
  ui: UiHandler
  /** Runs after everything else has shut down. */
  onExit?: () => Promise<void> | void
}

/** Runs RailBook until its window closes. */
export async function startApp({ ui, onExit }: StartOptions) {
  const directory = dataDirectory()
  mkdirSync(directory, { recursive: true })
  const instanceFile = path.join(directory, 'instance.json')
  if (await focusRunningInstance(instanceFile)) {
    log('RailBook is already open, so its window was brought forward.')
    return
  }

  const executable = findChrome()
  if (!executable) {
    throw new Error(
      "RailBook opens in Google Chrome, Chromium, Microsoft Edge or Brave, and couldn't find any of them. Install one, or set RAILBOOK_CHROME to the browser's path.",
    )
  }

  const store = await openStore(path.join(directory, 'data.json'))
  const scraping = createScrapingEngine({ executablePath: executable })
  const secret = randomBytes(32).toString('base64url')
  let window: AppWindow | null = null
  const server = await startServer({
    ui,
    store,
    scrape: scraping,
    openExternal,
    appInfo: { version: packageJson.version, dataDirectory: directory, browser: executable },
    openDataFolder: () => openFolder(directory),
    instanceSecret: secret,
    focus: async () => window?.focus(),
  })
  await claimInstance(instanceFile, { origin: server.origin, secret })

  let stopping: Promise<void> | undefined
  const stop = () =>
    (stopping ??= (async () => {
      await window?.close()
      await scraping.close()
      await server.close()
      await releaseInstance(instanceFile, secret)
      await onExit?.()
    })())
  const stopOnSignal = () => void stop().then(() => process.exit(0))
  process.once('SIGINT', stopOnSignal)
  process.once('SIGTERM', stopOnSignal)

  try {
    window = await openAppWindow(executable, {
      url: server.launchUrl,
      origin: server.origin,
      profile: path.join(directory, 'browser-profile'),
    })
    log(`RailBook is open, served from ${server.origin} with ${executable}.`)
    await window.closed
  } finally {
    await stop()
  }
}
