import { createWraith, type SelectorSchema, type Wraith, type WraithPage } from 'wraithjs'
import type { Fields } from '../../src/automation/fields'
import { DEFAULT_HUMAN_LEVEL, type HumanLevel } from '../../src/automation/human'
import { parseRenderOptions } from '../../src/automation/render'
import { ApiError } from '../apiError'
import { assertAllowedUrl } from './guard'
import { runAction, USER_AGENT } from './loader'
import { createSiteRecorder } from './siteRecorder'

const SETTLE_MS = 5000

export interface ManagedSiteOptions {
  /** The address to keep open. From RAILBOOK_SITE_URL. */
  url: string
  executablePath: string
  /** Show the browser window. Default true (hidden). */
  headless?: boolean
  /** How human clicks, typing and scrolling look. Default natural. */
  human?: HumanLevel
  userAgent?: string
  /** Log every click and key press on the page, for SitePage. Only under npm run dev. */
  record?: boolean
}

export interface SiteInfo {
  /** The address RAILBOOK_SITE_URL asked for. */
  configuredUrl: string
  /** Where the page is now, which actions and goto can change. */
  url: string
  title: string
  headless: boolean
}

/** Maps a thrown error to an ApiError, so the server answers with a fitting status. */
function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError(502, error instanceof Error ? error.message : String(error))
}

function checkUrl(address: string) {
  try {
    return assertAllowedUrl(address)
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : String(error))
  }
}

/**
 * Keeps one website open beside the app for its whole run, and lets app code read from and act on it. RailBook runs
 * it as itself: robots.txt is respected, the request says it comes from RailBook, and there are no proxies. Input looks
 * human, at the level `human` sets. The browser opens on first use.
 */
export function createManagedSite({
  url,
  executablePath,
  headless: initialHeadless = true,
  human: initialHuman = DEFAULT_HUMAN_LEVEL,
  userAgent = USER_AGENT,
  record = false,
}: ManagedSiteOptions) {
  // Refuses a malformed RAILBOOK_SITE_URL now, before anything opens.
  const configuredUrl = assertAllowedUrl(url)
  let headless = initialHeadless
  let human = initialHuman
  let wraith: Wraith | null = null
  let context: Awaited<ReturnType<Wraith['context']>> | null = null
  let pending: Promise<WraithPage> | null = null
  const recorder = record ? createSiteRecorder() : null
  /** What open and act do is RailBook's own, so the log marks it as the helper's. */
  const asHelper = <T>(run: () => Promise<T>) => (recorder ? recorder.asHelper(run) : run())

  async function openPage(address: string): Promise<WraithPage> {
    wraith ??= createWraith({
      launch: { executablePath },
      headless,
      human,
      userAgent,
      // Pictures make no difference to reading the page, but they do when you're watching it.
      blockResources: headless ? ['image', 'font', 'media'] : [],
      network: { timeout: 30_000, retries: 2, respectRobotsTxt: true },
      logger: false,
    })
    // Every page opens in a new browser context, so nothing a site stored before (cookies, local storage, IndexedDB,
    // cache, service workers) is left. Closing the old one makes WRAITH start a fresh one, in the same browser.
    await context?.close().catch(() => undefined)
    context = await wraith.context()
    if (recorder) await recorder.attach(context)
    const page = await wraith.open(address, { human })
    await page.waitForSettled({ timeout: SETTLE_MS }).catch(() => undefined)
    return page
  }

  /**
   * The open page, opening or reopening it when needed (for example after the window was closed by hand). A page that
   * has to open goes to `address`, by default the configured one. `fresh` opens it again even if it's already open.
   */
  async function page(address = configuredUrl, fresh = false): Promise<WraithPage> {
    const existing = pending ? await pending.catch(() => null) : null
    if (existing && !existing.raw.isClosed() && !fresh) return existing
    // RailBook opens it, so the log marks its loading as the helper's.
    pending = asHelper(() => openPage(address))
    // A failed open shouldn't be remembered, so the next call tries again.
    pending.catch(() => {
      pending = null
    })
    return pending
  }

  const info = async (current?: WraithPage): Promise<SiteInfo> => {
    const live = current ?? (await page())
    return { configuredUrl, url: live.url(), title: await live.title(), headless }
  }

  return {
    configuredUrl,
    get headless() {
      return headless
    },
    isHeadless: () => headless,
    /**
     * Development only: shows or hides the companion site's window, alongside the scraping browser. The current
     * browser closes and the page reopens the new way, back at the configured address.
     */
    async setHeadless(next: boolean) {
      if (next === headless) return
      headless = next
      const current = wraith
      wraith = null
      pending = null
      await current?.close()
      // Reopen now, so the window appears or disappears without waiting for the next read.
      await page().catch(() => undefined)
    },
    /** Changes how human input looks. A tab takes the level when it opens, so the page reopens where it is. */
    async setHuman(next: HumanLevel) {
      if (next === human) return
      human = next
      const current = pending ? await pending.catch(() => null) : null
      if (!current || current.raw.isClosed()) return
      const address = current.url()
      pending = null
      await current.close().catch(() => undefined)
      await page(address).catch(() => undefined)
    },
    /** Opens the page if it isn't already, and reports where it is. */
    async info() {
      try {
        return await info()
      } catch (error) {
        throw asApiError(error)
      }
    },
    /** Reads the live page with a WRAITH selector schema. */
    async extract(schema: unknown) {
      if (typeof schema !== 'object' || schema === null) throw new ApiError(400, 'Give a selector schema to read.')
      try {
        const live = await page()
        return await live.extract(schema as Fields as SelectorSchema)
      } catch (error) {
        if (error instanceof Error && /selector|unexpected|expected/i.test(error.message)) {
          throw new ApiError(400, `That selector isn't valid CSS: ${error.message}`)
        }
        throw asApiError(error)
      }
    },
    /** Opens another address, starting clean: cookies and everything else sites stored are gone (see openPage). */
    async open(address: unknown) {
      if (typeof address !== 'string') throw new ApiError(400, 'Give the address to open.')
      return asHelper(async () => {
        try {
          const target = checkUrl(address)
          const live = await page(target, true)
          return await info(live)
        } catch (error) {
          throw asApiError(error)
        }
      })
    },
    /** Runs clicks, typing, scrolling and waits on the page, in order. Same actions as a render job. */
    async act(options: unknown) {
      let actions
      try {
        actions = parseRenderOptions(options)
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : String(error))
      }
      return asHelper(async () => {
        try {
          const live = await page()
          for (const [index, action] of (actions.actions ?? []).entries()) await runAction(live, action, index)
          if (actions.waitFor) {
            await live.waitFor(actions.waitFor).catch(() => {
              throw new ApiError(400, `Nothing matched ${actions.waitFor} in time.`)
            })
          }
          return await info(live)
        } catch (error) {
          throw asApiError(error)
        }
      })
    },
    /** The click and key press log, when record is on. */
    log: recorder && {
      since: async (after: unknown) => ({ entries: recorder.since(typeof after === 'number' ? after : 0) }),
      clear: async () => {
        recorder.clear()
        return {}
      },
    },
    close: () => wraith?.close() ?? Promise.resolve(),
  }
}

export type ManagedSite = ReturnType<typeof createManagedSite>
