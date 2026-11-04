import {
  createWraith,
  extractHtml,
  HttpError,
  RobotsDisallowedError,
  type SelectorSchema,
  type WraithPage,
} from 'wraithjs'
import type { Fields } from '../../src/automation/fields'
import { DEFAULT_HUMAN_LEVEL, type HumanLevel } from '../../src/automation/human'
import { withoutHash, type LoadedPage, type PageLoader } from '../../src/automation/jobs'
import { globToRegExp, type PageAction, type RenderOptions } from '../../src/automation/render'

export const USER_AGENT = 'RailBook/0.1'
/** How long a page gets to go quiet after loading or after an action. Pages that never do still carry on. */
const SETTLE_MS = 5000

/** The tab a visible scraping browser keeps open, so its window is there before the first rendered page. */
const IDLE_PAGE = `<title>RailBook scraping browser</title>
<body style="font: 15px/1.5 system-ui, sans-serif; margin: 3em; max-width: 36em; color: #444">
<h1 style="font-size: 1.3em; color: #111">RailBook's scraping browser</h1>
<p>Jobs that render pages open each one in a new tab here, run its actions, and close the tab once it's read.</p>
<p>Plain pages are downloaded without the browser, so they don't show up here. Give a job render settings to watch it.</p>
</body>`

export interface LoaderOptions {
  /** Chrome, Chromium, Edge or Brave, for pages that need their JavaScript run. */
  executablePath: string
  userAgent?: string
  /** Smallest gap between requests to one site. A robots.txt Crawl-delay can make it longer. */
  minDelayMs?: number
  timeoutMs?: number
  /** Hide the browser. Turned off only in development, to watch pages load and actions run. Default true. */
  headless?: boolean
  /** How human clicks, typing and scrolling look in rendered pages. Default natural. */
  human?: HumanLevel
}

function host(url: string) {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    signal.throwIfAborted()
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** Turns WRAITH's, Playwright's and the network's errors into a sentence about the page. */
function explain(error: unknown, url: string): Error {
  const site = host(url)
  if (error instanceof RobotsDisallowedError)
    return new Error(`${site}/robots.txt doesn't allow reading ${new URL(url).pathname}.`)
  if (error instanceof HttpError) return new Error(`${site} answered ${error.status}.`)
  if (!(error instanceof Error)) return new Error(String(error))
  if (error.name === 'TimeoutError') return new Error(`${site} took too long to answer.`)
  const net = /net::ERR_[A-Z_]+/.exec(error.message)
  if (net) return new Error(`Couldn't read ${site}. ${net[0]}`)
  // fetch keeps the useful part, such as ENOTFOUND, in cause.
  if (error.cause instanceof Error) return new Error(`Couldn't read ${site}. ${error.cause.message}`)
  return error
}

// A bad selector fails on every page, so say clearly that it's the job's fault rather than the site's.
function readHtml<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    if (error instanceof Error && /selector|unexpected|expected/i.test(error.message)) {
      throw new Error(`A selector in this job isn't valid CSS: ${error.message}`)
    }
    throw error
  }
}

/** A page read from its HTML. Rendered pages are read once their actions finish, so no browser tab stays open. */
function fromHtml(url: string, status: number, body: string, captured: unknown[]): LoadedPage {
  const extract = (schema: Fields): unknown => readHtml(() => extractHtml(body, schema as SelectorSchema, url))
  return {
    url,
    status,
    body,
    captured,
    extract: async (fields) => extract(fields) as Record<string, unknown>,
    extractAll: async (each, fields) =>
      (extract({ items: { selector: each, list: true, fields } }) as { items: Record<string, unknown>[] }).items,
    links: async (selector) => {
      const { hrefs } = extract({ hrefs: { selector, attr: 'href', list: true } }) as { hrefs: string[] }
      return [...new Set(hrefs.filter((href) => /^https?:/i.test(href)).map(withoutHash))]
    },
    close: async () => undefined,
  }
}

export async function runAction(page: WraithPage, action: PageAction, index: number) {
  const name = `Action ${index + 1}`
  const present = async (selector: string) => (await page.raw.locator(selector).count()) > 0
  switch (action.type) {
    case 'click':
      for (let count = 0; count < (action.times ?? 1); count += 1) {
        if (!(await present(action.selector))) {
          // Repeated clicks stop once the button goes away, which is how "Load more" ends.
          if (count === 0) throw new Error(`${name}: nothing matched ${action.selector} to click.`)
          break
        }
        await page.click(action.selector)
        await page.waitForSettled({ timeout: SETTLE_MS })
      }
      return
    case 'type':
      if (!(await present(action.selector)))
        throw new Error(`${name}: nothing matched ${action.selector} to type into.`)
      await page.type(action.selector, action.text, { typos: false })
      return
    case 'press':
      await page.press(action.key)
      await page.waitForSettled({ timeout: SETTLE_MS })
      return
    case 'scroll':
      await page.autoScroll({ maxScrolls: action.times })
      return
    case 'wait':
      await page.wait(action.ms)
      return
    case 'waitFor':
      await page.waitFor(action.selector).catch(() => {
        throw new Error(`${name}: nothing matched ${action.selector} in time.`)
      })
  }
}

/**
 * Loads pages with WRAITH. RailBook runs it as itself: robots.txt is respected, requests say they come from RailBook,
 * and there are no proxies or rotating user agents. Input in rendered pages looks human, at the level `human` sets.
 */
export function createWraithLoader({
  executablePath,
  userAgent = USER_AGENT,
  minDelayMs = 1000,
  timeoutMs = 30_000,
  headless = true,
  human: initialHuman = DEFAULT_HUMAN_LEVEL,
}: LoaderOptions): PageLoader & { show(): Promise<void>; setHuman(level: HumanLevel): void; close(): Promise<void> } {
  let human = initialHuman
  const wraith = createWraith({
    launch: { executablePath },
    headless,
    human,
    userAgent,
    blockResources: ['image', 'font', 'media'],
    network: {
      timeout: timeoutMs,
      retries: 2,
      respectRobotsTxt: true,
      rateLimit: { concurrency: 2, maxRequests: 1, intervalMs: minDelayMs },
    },
    logger: false,
  })

  // WRAITH launches its browser on the first page and closes rendered tabs once read, so a visible browser holds a
  // tab of its own to keep the window up. Closed by hand, it comes back with the next rendered page.
  let idle: Promise<WraithPage> | undefined
  async function show() {
    if (headless) return
    const current = await idle?.catch(() => undefined)
    if (current && !current.raw.isClosed()) return
    idle = wraith.newPage().then(async (page) => {
      await page.raw.setContent(IDLE_PAGE)
      return page
    })
    await idle
  }

  const check = (address: string) => {
    let url: URL
    try {
      url = new URL(withoutHash(address))
    } catch {
      throw new Error(`Not a web address: ${address}`)
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https pages can be read.')
    return url.href
  }

  const checkResponse = (requested: string, status: number) => {
    if (status >= 400) throw new Error(`${host(requested)} answered ${status}.`)
  }

  async function loadStatic(url: string, signal?: AbortSignal) {
    const page = await abortable(wraith.fetch(url), signal).catch((error: unknown) => {
      throw signal?.aborted ? error : explain(error, url)
    })
    checkResponse(url, page.status)
    return fromHtml(page.url, page.status, page.body, [])
  }

  async function loadRendered(url: string, options: RenderOptions, signal?: AbortSignal) {
    await show()
    // Each tab takes the level when it opens, so a change applies from the next page on.
    const page = await wraith.newPage({ human })
    // Closing the tab is how a cancelled run stops whatever the page was doing.
    const onAbort = () => void page.close().catch(() => undefined)
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const capture = options.capture ? page.captureJson(globToRegExp(options.capture)) : null
      const response = await page.goto(url)
      const status = response?.status() ?? 200
      checkResponse(url, status)
      await page.waitForSettled({ timeout: SETTLE_MS })
      for (const [index, action] of (options.actions ?? []).entries()) {
        signal?.throwIfAborted()
        await runAction(page, action, index)
      }
      if (options.waitFor) {
        await page.waitFor(options.waitFor).catch(() => {
          throw new Error(`Nothing matched ${options.waitFor} in time.`)
        })
      }
      capture?.stop()
      return fromHtml(page.url(), status, await page.html(), capture?.data ?? [])
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      throw explain(error, url)
    } finally {
      signal?.removeEventListener('abort', onAbort)
      await page.close().catch(() => undefined)
    }
  }

  return {
    async load(address, { signal, render }) {
      signal?.throwIfAborted()
      const url = check(address)
      return render ? loadRendered(url, render, signal) : loadStatic(url, signal)
    },
    /** Opens a visible browser's window now, rather than at the first rendered page. Does nothing when hidden. */
    show,
    setHuman(level) {
      human = level
    },
    close: () => wraith.close(),
  }
}
