import { isBlockedHost } from './blockedHosts'
import type { Field, Fields, ValueField } from './fields'
import { globToRegExp, parseRenderOptions, type RenderOptions } from './render'

export type NavigationStep =
  /** Keeps each page and follows its first `next` link, up to maxPages pages per chain. */
  | { type: 'paginate'; next: string; maxPages: number }
  /** Replaces each page with up to `max` of the pages its matching links point to. */
  | { type: 'follow'; links: string; max: number }
  /**
   * Keeps each page and follows its links level by level, up to maxDepth links away. Without include patterns it
   * stays on the starting page's site.
   */
  | { type: 'crawl'; links?: string; include?: string[]; exclude?: string[]; maxDepth: number }

export type Extraction =
  /** CSS selectors: one record per page, or with each, one per matching element. */
  | { from?: 'html'; each?: string; fields: Fields }
  /**
   * The page itself as JSON, or the JSON it requested when rendering captured some. each is a dot path to the list
   * of items, and fields map names to dot paths inside each item. Without fields, items are kept whole.
   */
  | { from: 'json'; each?: string; fields?: Record<string, string> }

/** Plain data, so jobs can be saved as JSON. */
export interface Job {
  id: string
  name: string
  /** Pages the job starts from. */
  urls: string[]
  /** Adds the addresses listed in a sitemap to the start pages. */
  sitemap?: { url: string; match?: string; max: number }
  /** Read every page in a browser, after its JavaScript has run. Slower, so only for sites that need it. */
  render?: boolean | RenderOptions
  /** Run in order before extracting. */
  steps: NavigationStep[]
  extract: Extraction
  /** Field that identifies a record between runs, such as its link. Without one, whole records are compared. */
  key?: string
  /** Run automatically once the last run is this old. */
  everyMinutes?: number
  /** Show a notification when a run finds new or changed records. */
  notify?: boolean
  pageLimit?: number
  /** Pages loaded at the same time. Requests to one site still wait their turn. */
  concurrency?: number
}

/** A page as the scraping engine hands it over. Rendered pages hold a browser tab until they're closed. */
export interface LoadedPage {
  /** Final address after redirects. */
  url: string
  status: number
  /** The HTML, or the raw body of a response that isn't HTML. */
  body: string
  /** JSON the page requested while rendering, when its render options asked to capture it. */
  captured: unknown[]
  extract(fields: Fields): Promise<Record<string, unknown>>
  /** One record per element matching each. */
  extractAll(each: string, fields: Fields): Promise<Record<string, unknown>[]>
  /** Absolute http(s) addresses from the matching elements' href, without #fragments or repeats. */
  links(selector: string): Promise<string[]>
  close(): Promise<void>
}

/** Loads pages politely: robots.txt, rate limits and retries are the loader's job. Rejects with a readable Error. */
export interface PageLoader {
  load(url: string, options: { signal?: AbortSignal; render?: RenderOptions }): Promise<LoadedPage>
}

export interface ScrapedRecord {
  /** Page the record was read from. */
  url: string
  data: Record<string, unknown>
}

export interface RunError {
  url: string
  message: string
}

export interface JobRun {
  startedAt: string
  finishedAt: string
  /** Pages requested, including ones that failed. */
  pages: number
  records: ScrapedRecord[]
  errors: RunError[]
}

export interface RunProgress {
  pages: number
  records: number
  /** The page that just loaded. */
  url: string
}

export interface RunOptions {
  signal?: AbortSignal
  onProgress?: (progress: RunProgress) => void
}

export const LIMITS = {
  pages: { default: 100, max: 1000 },
  concurrency: { default: 2, max: 6 },
  everyMinutes: { min: 5, max: 7 * 24 * 60 },
}

/** A problem with one page, such as it not being JSON, rather than with the job. */
class PageError extends Error {}

export function withoutHash(url: string) {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.href
  } catch {
    return url
  }
}

function createLimiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}

/** Reads a dot path such as "data.items.0.title". */
export function getPath(value: unknown, path: string): unknown {
  if (!path.trim()) return value
  return path
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current !== null && typeof current === 'object' ? (current as Record<string, unknown>)[part.trim()] : undefined,
      value,
    )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extractJson(sources: unknown[], { each, fields }: { each?: string; fields?: Record<string, string> }) {
  return sources.flatMap((source) => {
    const items = each ? getPath(source, each) : source
    const list = Array.isArray(items) ? items : items === undefined ? [] : [items]
    return list.map((item): Record<string, unknown> => {
      if (fields) {
        return Object.fromEntries(Object.entries(fields).map(([name, path]) => [name, getPath(item, path) ?? null]))
      }
      return isPlainObject(item) ? item : { value: item }
    })
  })
}

/** The records one page holds. Rejects for a bad selector, which would fail on every page. */
export async function extractRecords(page: LoadedPage, extraction: Extraction): Promise<Record<string, unknown>[]> {
  if (extraction.from === 'json') {
    let sources = page.captured
    if (sources.length === 0) {
      try {
        sources = [JSON.parse(page.body)]
      } catch {
        throw new PageError("This page isn't JSON. Read it with HTML fields, or capture the JSON it requests.")
      }
    }
    return extractJson(sources, extraction)
  }
  const { each, fields } = extraction
  return each ? page.extractAll(each, fields) : [await page.extract(fields)]
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Loads pages through the loader, a few at a time, and keeps going past pages that fail, listing them in errors.
 * Pages stream through the steps one by one and close as soon as they're used, so a big crawl doesn't hold every page
 * (or browser tab) at once. Records come out in page order whatever the concurrency. Cancelling through the signal
 * rejects with the signal's reason, and so does a bad selector, since it would fail on every page.
 */
export async function runJob(job: Job, loader: PageLoader, { signal, onProgress }: RunOptions = {}): Promise<JobRun> {
  const startedAt = new Date().toISOString()
  const pageLimit = Math.min(job.pageLimit ?? LIMITS.pages.default, LIMITS.pages.max)
  const limit = createLimiter(Math.min(job.concurrency ?? LIMITS.concurrency.default, LIMITS.concurrency.max))
  const render = job.render === true ? {} : job.render || undefined
  const visited = new Set<string>()
  const errors: RunError[] = []
  let pages = 0
  let recordCount = 0
  let limitReached = false

  const fail = (url: string, error: unknown) => {
    if (signal?.aborted) throw error
    errors.push({ url, message: error instanceof Error ? error.message : String(error) })
  }

  const request = async (url: string, options: { render?: RenderOptions } = {}) => {
    if (pages >= pageLimit) {
      if (!limitReached) errors.push({ url, message: `Stopped at the ${pageLimit}-page limit.` })
      limitReached = true
      return null
    }
    pages += 1
    try {
      const page = await limit(() => loader.load(url, { signal, ...options }))
      onProgress?.({ pages, records: recordCount, url: page.url })
      return page
    } catch (error) {
      fail(url, error)
      return null
    }
  }

  const load = async (url: string) => {
    const key = withoutHash(url)
    if (visited.has(key)) return null
    visited.add(key)
    const page = await request(url, { render })
    if (page) visited.add(page.url)
    return page
  }

  // The last step for every page, and the one that closes it.
  const extractFrom = async (page: LoadedPage): Promise<ScrapedRecord[]> => {
    try {
      const records = (await extractRecords(page, job.extract)).map((data) => ({ url: page.url, data }))
      recordCount += records.length
      return records
    } catch (error) {
      if (!(error instanceof PageError)) throw error
      errors.push({ url: page.url, message: error.message })
      return []
    } finally {
      await page.close()
    }
  }

  const crawl = async (
    start: LoadedPage,
    step: Extract<NavigationStep, { type: 'crawl' }>,
    next: (page: LoadedPage) => Promise<ScrapedRecord[]>,
  ) => {
    const origin = new URL(start.url).origin
    const include = step.include?.length ? step.include.map(globToRegExp) : null
    const exclude = (step.exclude ?? []).map(globToRegExp)
    const inScope = (url: string) =>
      (include ? include.some((pattern) => pattern.test(url)) : new URL(url).origin === origin) &&
      !exclude.some((pattern) => pattern.test(url))

    const results: ScrapedRecord[][] = []
    let level = [start]
    for (let depth = 0; level.length > 0; depth += 1) {
      // Read the links before the later steps close the pages.
      const found =
        depth < step.maxDepth ? await Promise.all(level.map((page) => page.links(step.links || 'a[href]'))) : []
      results.push(...(await Promise.all(level.map(next))))
      const links = new Set(found.flat().filter(inScope))
      const loaded = await Promise.all([...links].filter((url) => !visited.has(url)).map(load))
      level = loaded.filter((page) => page !== null)
    }
    return results.flat()
  }

  const process = async (page: LoadedPage, stage: number): Promise<ScrapedRecord[]> => {
    const step = job.steps[stage]
    if (!step) return extractFrom(page)
    const next = (child: LoadedPage) => process(child, stage + 1)

    if (step.type === 'follow') {
      const urls = (await page.links(step.links)).slice(0, step.max)
      await page.close()
      const results = await Promise.all(
        urls.map(async (url) => {
          const child = await load(url)
          return child ? next(child) : []
        }),
      )
      return results.flat()
    }
    if (step.type === 'crawl') return crawl(page, step, next)

    const results: ScrapedRecord[][] = []
    let current: LoadedPage | null = page
    for (let count = 1; current; count += 1) {
      const following: string | undefined = count < step.maxPages ? (await current.links(step.next))[0] : undefined
      results.push(await next(current))
      current = following ? await load(following) : null
    }
    return results.flat()
  }

  const readSitemap = async ({ url, match, max }: NonNullable<Job['sitemap']>) => {
    const pattern = match ? globToRegExp(match) : null
    const found: string[] = []
    const queue = [url]
    // A sitemap index points at more sitemaps; read a few of them, not all.
    for (let read = 0; queue.length > 0 && found.length < max && read < 5; read += 1) {
      const address = queue.shift() as string
      const page = await request(address)
      if (!page) continue
      const text = page.body
      await page.close()
      const locations = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => decodeXml(match[1] ?? ''))
      if (/<sitemapindex[\s>]/i.test(text)) queue.push(...locations)
      else found.push(...locations.filter((location) => !pattern || pattern.test(location)))
    }
    return found.slice(0, max)
  }

  const starts = [...job.urls, ...(job.sitemap ? await readSitemap(job.sitemap) : [])]
  const results = await Promise.all(
    starts.map(async (url) => {
      const page = await load(url)
      return page ? process(page, 0) : []
    }),
  )

  return { startedAt, finishedAt: new Date().toISOString(), pages, records: results.flat(), errors }
}

// ---------- Validation ----------

function webAddress(value: unknown, name: string) {
  let url: URL
  try {
    url = new URL(String(value).trim())
  } catch {
    throw new Error(`${name} isn't a web address: ${String(value)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${name} must start with http or https.`)
  if (isBlockedHost(url.hostname)) throw new Error(`RailBook doesn't scrape ${url.hostname}.`)
  return url.href
}

function required(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} needs a value.`)
  return value.trim()
}

function wholeNumber(value: unknown, name: string, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`)
  }
  return value
}

function patterns(value: unknown, name: string) {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`${name} must be a list.`)
  const list = (value as string[]).map((item) => item.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

function parseStep(value: unknown, index: number): NavigationStep {
  const step = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const name = `Step ${index + 1}`
  switch (step.type) {
    case 'paginate':
      return {
        type: 'paginate',
        next: required(step.next, `${name}'s next-page link`),
        maxPages: wholeNumber(step.maxPages, `${name}'s page count`, 1, 500),
      }
    case 'follow':
      return {
        type: 'follow',
        links: required(step.links, `${name}'s links`),
        max: wholeNumber(step.max, `${name}'s link count`, 1, 1000),
      }
    case 'crawl': {
      const crawl: NavigationStep = { type: 'crawl', maxDepth: wholeNumber(step.maxDepth, `${name}'s depth`, 0, 5) }
      if (typeof step.links === 'string' && step.links.trim()) crawl.links = step.links.trim()
      const include = patterns(step.include, `${name}'s include patterns`)
      const exclude = patterns(step.exclude, `${name}'s exclude patterns`)
      if (include) crawl.include = include
      if (exclude) crawl.exclude = exclude
      return crawl
    }
    default:
      throw new Error(`${name} has an unknown type.`)
  }
}

const TEXT_KEYS = ['selector', 'attr', 'default', 'text', 'near'] as const

function parseField(value: unknown, name: string): Field {
  if (typeof value === 'string') return required(value, `The selector for ${name}`)
  if (typeof value !== 'object' || value === null) throw new Error(`The field ${name} isn't valid.`)
  const field = value as Record<string, unknown>
  if (field.fields !== undefined) {
    const nested = { selector: required(field.selector, `The selector for ${name}`), fields: parseFields(field.fields) }
    return field.list === true ? { ...nested, list: true } : nested
  }
  const result: ValueField = {}
  for (const key of TEXT_KEYS) {
    if (typeof field[key] === 'string' && field[key].trim()) result[key] = field[key].trim()
  }
  if (field.html === true) result.html = true
  if (field.list === true) result.list = true
  if (!result.selector && !result.text && !result.near && !result.attr) {
    throw new Error(`The field ${name} needs a selector, text or label to look for.`)
  }
  return result
}

function parseFields(value: unknown): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Fields must be named.')
  const entries = Object.entries(value).filter(([name]) => name.trim())
  if (entries.length === 0) throw new Error('Add at least one field to extract.')
  return Object.fromEntries(entries.map(([name, field]) => [name.trim(), parseField(field, name)]))
}

function parseExtraction(value: unknown): Extraction {
  const extraction = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const each = typeof extraction.each === 'string' && extraction.each.trim() ? extraction.each.trim() : undefined
  if (extraction.from === 'json') {
    const result: Extraction = { from: 'json' }
    if (each) result.each = each
    if (extraction.fields !== undefined) {
      const fields = parseFields(extraction.fields)
      if (Object.values(fields).some((path) => typeof path !== 'string')) throw new Error('JSON fields are dot paths.')
      result.fields = fields as Record<string, string>
    }
    return result
  }
  return each ? { each, fields: parseFields(extraction.fields) } : { fields: parseFields(extraction.fields) }
}

/** Checks a job that arrives as JSON and keeps only what RailBook understands. */
export function validateJob(input: unknown): { job: Job; errors: [] } | { job: null; errors: string[] } {
  const errors: string[] = []
  const value = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const attempt = <T>(read: () => T): T | undefined => {
    try {
      return read()
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  const job: Partial<Job> = {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: attempt(() => required(value.name, 'The name').slice(0, 100)),
    urls: attempt(() => {
      if (!Array.isArray(value.urls)) throw new Error('Start pages must be a list.')
      return value.urls
        .filter((url) => typeof url === 'string' && url.trim())
        .slice(0, 100)
        .map((url, index) => webAddress(url, `Start page ${index + 1}`))
    }),
    steps: attempt(() => {
      const steps = value.steps ?? []
      if (!Array.isArray(steps) || steps.length > 5) throw new Error('A job can have at most 5 steps.')
      return steps.map(parseStep)
    }),
    extract: attempt(() => parseExtraction(value.extract)),
  }

  if (value.sitemap) {
    attempt(() => {
      const sitemap = value.sitemap as Record<string, unknown>
      job.sitemap = {
        url: webAddress(sitemap.url, 'The sitemap'),
        max: wholeNumber(sitemap.max, 'The sitemap page count', 1, LIMITS.pages.max),
      }
      if (typeof sitemap.match === 'string' && sitemap.match.trim()) job.sitemap.match = sitemap.match.trim()
    })
  }
  if (job.urls?.length === 0 && !job.sitemap) errors.push('Add at least one start page or a sitemap.')
  if (value.render) attempt(() => (job.render = value.render === true ? true : parseRenderOptions(value.render)))
  if (value.key !== undefined && value.key !== '') {
    attempt(() => {
      const key = required(value.key, 'The record key')
      const fields = job.extract && 'fields' in job.extract && job.extract.fields ? Object.keys(job.extract.fields) : []
      if (fields.length > 0 && !fields.includes(key)) throw new Error(`The record key must be one of the fields.`)
      job.key = key
    })
  }
  if (value.everyMinutes !== undefined && value.everyMinutes !== null) {
    const { min, max } = LIMITS.everyMinutes
    attempt(() => (job.everyMinutes = wholeNumber(value.everyMinutes, 'The schedule', min, max)))
  }
  if (value.notify === true) job.notify = true
  if (value.pageLimit !== undefined) {
    attempt(() => (job.pageLimit = wholeNumber(value.pageLimit, 'The page limit', 1, LIMITS.pages.max)))
  }
  if (value.concurrency !== undefined) {
    attempt(() => (job.concurrency = wholeNumber(value.concurrency, 'Parallel pages', 1, LIMITS.concurrency.max)))
  }

  return errors.length > 0 ? { job: null, errors } : { job: job as Job, errors: [] }
}
