import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import packageJson from '../package.json'
import { findChrome } from './chrome'
import { claimInstance, focusRunningInstance, releaseInstance } from './instance'
import { createScrapingEngine } from './scraping/engine'
import { createManagedSite, type ManagedSite } from './scraping/managedSite'
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

const DEV_HEADLESS_KEY = 'devScrapingHeadless'

export interface StartOptions {
  ui: UiHandler
  /** Set by npm run dev. headed starts the scraping browser visible; otherwise the last choice in Settings holds. */
  dev?: { headed?: boolean }
  /** Runs after everything else has shut down. */
  onExit?: () => Promise<void> | void
}

/** Runs RailBook until its window closes. */
export async function startApp({ ui, onExit, dev }: StartOptions) {
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
  const headless = dev ? !dev.headed && store.get(DEV_HEADLESS_KEY) !== 'false' : true
  const scraping = createScrapingEngine({ executablePath: executable, headless })
  if (dev) log(`Scraping browser: ${headless ? 'hidden' : 'visible'}. Switch it in Settings › Developer.`)

  // RAILBOOK_SITE_URL keeps one website open beside the app for its whole run; RAILBOOK_SITE_HEADED shows its window.
  let site: ManagedSite | undefined
  if (process.env.RAILBOOK_SITE_URL) {
    const siteHeadless = !/^(1|true|yes|on)$/i.test(process.env.RAILBOOK_SITE_HEADED ?? '')
    try {
      site = createManagedSite({
        url: process.env.RAILBOOK_SITE_URL,
        executablePath: executable,
        headless: siteHeadless,
      })
      log(`Companion site: ${site.configuredUrl} (${siteHeadless ? 'hidden' : 'visible'}).`)
    } catch (error) {
      log(`Companion site not opened: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const secret = randomBytes(32).toString('base64url')
  let window: AppWindow | null = null
  const server = await startServer({
    ui,
    store,
    scrape: scraping,
    site: site && { info: site.info, extract: site.extract, open: site.open, act: site.act },
    openExternal,
    appInfo: { version: packageJson.version, dataDirectory: directory, browser: executable },
    dev: dev && {
      isHeadless: scraping.isHeadless,
      setHeadless: async (next) => {
        await scraping.setHeadless(next)
        // The companion site follows the same switch, reopening visible or hidden to match.
        await site?.setHeadless(next)
        await store.set(DEV_HEADLESS_KEY, String(next))
      },
    },
    openDataFolder: () => openFolder(directory),
    instanceSecret: secret,
    focus: async () => window?.focus(),
  })
  await claimInstance(instanceFile, { origin: server.origin, secret })

  let stopping: Promise<void> | undefined
  const stop = () =>
    (stopping ??= (async () => {
      await window?.close()
      await site?.close()
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
    if (site)
      void site.info().catch((error) => log(`Companion site: ${error instanceof Error ? error.message : error}`))
    await window.closed
  } finally {
    await stop()
  }
}
