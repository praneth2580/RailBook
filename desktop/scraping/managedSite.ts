import { createWraith, type SelectorSchema, type Wraith, type WraithPage } from 'wraithjs'
import type { Fields } from '../../src/automation/fields'
import { parseRenderOptions } from '../../src/automation/render'
import { ApiError } from '../apiError'
import { assertAllowedUrl } from './guard'
import { runAction, USER_AGENT } from './loader'

const SETTLE_MS = 5000

export interface ManagedSiteOptions {
  /** The address to keep open. From RAILBOOK_SITE_URL. */
  url: string
  executablePath: string
  /** Show the browser window. Default true (hidden). */
  headless?: boolean
  userAgent?: string
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
 * it as itself: robots.txt is respected, the request says it comes from RailBook, input isn't made to look human, and
 * there are no proxies. The browser opens on first use.
 */
export function createManagedSite({
  url,
  executablePath,
  headless: initialHeadless = true,
  userAgent = USER_AGENT,
}: ManagedSiteOptions) {
  // Refuses a malformed RAILBOOK_SITE_URL now, before anything opens.
  const configuredUrl = assertAllowedUrl(url)
  let headless = initialHeadless
  let wraith: Wraith | null = null
  let pending: Promise<WraithPage> | null = null

  async function openPage(): Promise<WraithPage> {
    wraith ??= createWraith({
      launch: { executablePath },
      headless,
      human: 'off',
      userAgent,
      // Pictures make no difference to reading the page, but they do when you're watching it.
      blockResources: headless ? ['image', 'font', 'media'] : [],
      network: { timeout: 30_000, retries: 2, respectRobotsTxt: true },
      logger: false,
    })
    const page = await wraith.open(configuredUrl)
    await page.waitForSettled({ timeout: SETTLE_MS }).catch(() => undefined)
    return page
  }

  /** The open page, opening or reopening it when needed (for example after the window was closed by hand). */
  async function page(): Promise<WraithPage> {
    const existing = pending ? await pending.catch(() => null) : null
    if (existing && !existing.raw.isClosed()) return existing
    pending = openPage()
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
    /** Navigates the page to another address. */
    async open(address: unknown) {
      if (typeof address !== 'string') throw new ApiError(400, 'Give the address to open.')
      try {
        const target = checkUrl(address)
        const live = await page()
        await live.goto(target)
        await live.waitForSettled({ timeout: SETTLE_MS }).catch(() => undefined)
        return await info(live)
      } catch (error) {
        throw asApiError(error)
      }
    },
    /** Runs clicks, typing, scrolling and waits on the page, in order. Same actions as a render job. */
    async act(options: unknown) {
      let actions
      try {
        actions = parseRenderOptions(options)
      } catch (error) {
        throw new ApiError(400, error instanceof Error ? error.message : String(error))
      }
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
    },
    close: () => wraith?.close() ?? Promise.resolve(),
  }
}

export type ManagedSite = ReturnType<typeof createManagedSite>
