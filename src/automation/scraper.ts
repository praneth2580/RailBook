import { isBlockedHost } from './blockedHosts'
import { documentBaseUrl, extract, parseHtml, type Extracted, type Fields } from './extract'
import { defaultHttpClient, type HttpClient, type HttpResponse, type RenderOptions } from './http'
import { ALLOW_ALL, parseRobots, type RobotsRules } from './robots'

const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const MAX_RETRY_WAIT_MS = 60_000

export interface ScraperOptions {
  http?: HttpClient
  /** Sent with every request. Its first word is the name robots.txt groups are matched against. */
  userAgent?: string
  /** Smallest gap between requests to one host. A robots.txt Crawl-delay can make it longer. */
  minDelayMs?: number
  timeoutMs?: number
  /** Rendered pages also wait for their scripts and network requests, so they get longer. */
  renderTimeoutMs?: number
  /** Extra attempts after a network error, timeout, 429 or 5xx. */
  retries?: number
  /** Added to BLOCKED_HOSTS. */
  blockedHosts?: string[]
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  now?: () => number
}

export interface Page {
  /** Final address after redirects. */
  url: string
  status: number
  headers: Record<string, string>
  text: string
  /** Parsed on first use. */
  readonly document: Document
  json<T = unknown>(): T
  extract<const F extends Fields>(fields: F): Extracted<F>
  /** Absolute http(s) links from the matching elements' href, without #fragments or repeats. */
  links(selector: string): string[]
}

export interface GetOptions {
  signal?: AbortSignal
  /** Read the page after its JavaScript has run, for sites that build their content in the browser. */
  render?: boolean | RenderOptions
}

export interface Scraper {
  get(url: string, options?: GetOptions): Promise<Page>
}

export class ScrapeError extends Error {
  readonly url: string
  readonly status: number | undefined

  constructor(message: string, url: string, status?: number) {
    super(message)
    this.name = 'ScrapeError'
    this.url = url
    this.status = status
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted()
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Retry-After is either seconds or an HTTP date. */
function retryAfterMs(value: string | undefined, now: number) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - now)
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function withoutHash(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.href
  } catch {
    return url
  }
}

function createPage(response: HttpResponse): Page {
  let document: Document | undefined
  const parsed = () => (document ??= parseHtml(response.body))

  const page: Page = {
    url: response.url,
    status: response.status,
    headers: response.headers,
    text: response.body,
    get document() {
      return parsed()
    },
    json: <T>() => JSON.parse(response.body) as T,
    extract: (fields) => extract(parsed(), fields, documentBaseUrl(parsed(), response.url)),
    links(selector) {
      const { hrefs } = page.extract({ hrefs: { selector, attr: 'href', all: true } })
      const absolute = hrefs.filter((href) => /^https?:/i.test(href)).map(withoutHash)
      return [...new Set(absolute)]
    },
  }
  return page
}

type RobotsResult = { rules: RobotsRules } | { unreachable: string }

export function createScraper({
  http = defaultHttpClient,
  userAgent = 'RailBook/0.1',
  minDelayMs = 1000,
  timeoutMs = 15_000,
  renderTimeoutMs = 30_000,
  retries = 2,
  blockedHosts = [],
  sleep: wait = sleep,
  now = Date.now,
}: ScraperOptions = {}): Scraper {
  const robotsAgent = userAgent.split(/[\s/]/)[0] ?? userAgent
  const nextSlot = new Map<string, number>()
  const robotsByOrigin = new Map<string, Promise<RobotsResult>>()

  // Slots are reserved before waiting, so overlapping calls still queue up behind each other.
  async function waitTurn(host: string, gapMs: number, signal?: AbortSignal) {
    const current = now()
    const at = Math.max(current, nextSlot.get(host) ?? 0)
    nextSlot.set(host, at + gapMs)
    if (at > current) await wait(at - current, signal)
  }

  async function request(url: URL, gapMs: number, signal?: AbortSignal, render?: RenderOptions) {
    const headers = {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    }
    for (let attempt = 0; ; attempt++) {
      await waitTurn(url.host, gapMs, signal)
      let backoff = 1000 * 2 ** attempt
      try {
        const response = await http.get({
          url: url.href,
          headers,
          timeoutMs: render ? renderTimeoutMs : timeoutMs,
          signal,
          render,
        })
        if (!RETRY_STATUSES.has(response.status) || attempt >= retries) return response
        backoff = retryAfterMs(response.headers['retry-after'], now()) ?? backoff
        if (backoff > MAX_RETRY_WAIT_MS) return response
      } catch (error) {
        if (signal?.aborted) throw signal.reason
        if (attempt >= retries) throw new ScrapeError(`Couldn't read ${url.host}. ${message(error)}`, url.href)
      }
      await wait(backoff, signal)
    }
  }

  // RFC 9309: a missing robots.txt (4xx) allows everything; an unreachable one (5xx, network) allows nothing.
  async function fetchRobots(origin: string, signal?: AbortSignal): Promise<RobotsResult> {
    try {
      const response = await request(new URL('/robots.txt', origin), minDelayMs, signal)
      if (response.status >= 500) return { unreachable: `It answered ${response.status}.` }
      if (response.status >= 400) return { rules: ALLOW_ALL }
      return { rules: parseRobots(response.body, robotsAgent) }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      return { unreachable: message(error) }
    }
  }

  function robotsFor(origin: string, signal?: AbortSignal) {
    let result = robotsByOrigin.get(origin)
    if (!result) {
      result = fetchRobots(origin, signal)
      robotsByOrigin.set(origin, result)
      // A cancelled lookup says nothing about the site, so let the next call try again.
      result.catch(() => robotsByOrigin.delete(origin))
    }
    return result
  }

  return {
    async get(address, { signal, render } = {}) {
      let url: URL
      try {
        url = new URL(withoutHash(address))
      } catch {
        throw new ScrapeError(`Not a web address: ${address}`, address)
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ScrapeError('Only http and https pages can be read.', address)
      }
      if (isBlockedHost(url.hostname, blockedHosts)) throw new ScrapeError(`RailBook doesn't scrape ${url.hostname}.`, address)

      const robots = await robotsFor(url.origin, signal)
      if ('unreachable' in robots) {
        throw new ScrapeError(
          `Couldn't read ${url.host}/robots.txt, so its pages are off limits for now. ${robots.unreachable}`,
          address,
        )
      }
      if (!robots.rules.isAllowed(url.pathname + url.search)) {
        throw new ScrapeError(`${url.host}/robots.txt doesn't allow reading ${url.pathname}.`, address)
      }

      const gapMs = Math.max(minDelayMs, (robots.rules.crawlDelay ?? 0) * 1000)
      const response = await request(url, gapMs, signal, render === true ? {} : render || undefined)
      const finalUrl = new URL(response.url || url.href)
      // Redirects aren't followed by hand, so check where they ended up.
      if (isBlockedHost(finalUrl.hostname, blockedHosts)) {
        throw new ScrapeError(`RailBook doesn't scrape ${finalUrl.hostname}.`, address)
      }
      if (response.status >= 400) {
        throw new ScrapeError(`${url.host} answered ${response.status}.`, address, response.status)
      }
      return createPage({ ...response, url: finalUrl.href })
    },
  }
}
