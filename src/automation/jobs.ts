import type { Fields } from './extract'
import type { RenderOptions } from './http'
import { withoutHash, type Page, type Scraper } from './scraper'

export type NavigationStep =
  /** Keeps each page and follows its first `next` link, up to maxPages pages per chain. */
  | { type: 'paginate'; next: string; maxPages: number }
  /** Replaces each page with up to `max` of the pages its matching links point to. */
  | { type: 'follow'; links: string; max: number }

/** Plain data, so jobs can be saved as JSON. */
export interface Job {
  id: string
  name: string
  /** Pages the job starts from. */
  urls: string[]
  /** Run in order before extracting. */
  steps: NavigationStep[]
  /** Read on every page the steps end on: one record per page, or with each, one per matching element. */
  extract: { each?: string; fields: Fields }
  /** Read every page after its JavaScript has run. Slower, so only for sites that need it. */
  render?: boolean | RenderOptions
  /** Field that identifies a record between runs, such as its link. Without one, whole records are compared. */
  key?: string
  /** Run automatically once the last run is this old. */
  everyMinutes?: number
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

export interface RunOptions {
  signal?: AbortSignal
  /** Stops requesting pages after this many, whatever the steps ask for. */
  pageLimit?: number
  onPage?: (url: string, pagesSoFar: number) => void
}

/**
 * Fetches pages one at a time and keeps going past pages that fail, listing them in errors.
 * Cancelling through the signal rejects with the signal's reason. A bad selector also rejects, because it
 * would fail on every page.
 */
export async function runJob(job: Job, scraper: Scraper, { signal, pageLimit = 50, onPage }: RunOptions = {}) {
  const startedAt = new Date().toISOString()
  const visited = new Set<string>()
  const errors: RunError[] = []
  let pages = 0
  let limitReached = false

  const load = async (url: string) => {
    const key = withoutHash(url)
    if (visited.has(key)) return null
    visited.add(key)
    if (pages >= pageLimit) {
      if (!limitReached) errors.push({ url, message: `Stopped at the ${pageLimit}-page limit.` })
      limitReached = true
      return null
    }
    pages += 1
    try {
      const page = await scraper.get(url, { signal, render: job.render })
      visited.add(page.url)
      onPage?.(page.url, pages)
      return page
    } catch (error) {
      if (signal?.aborted) throw error
      errors.push({ url, message: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  const loadAll = async (urls: string[]) => {
    const loaded: Page[] = []
    for (const url of urls) {
      const page = await load(url)
      if (page) loaded.push(page)
    }
    return loaded
  }

  let current = await loadAll(job.urls)
  for (const step of job.steps) {
    const next: Page[] = []
    for (const start of current) {
      if (step.type === 'follow') {
        next.push(...(await loadAll(start.links(step.links).slice(0, step.max))))
        continue
      }
      let page: Page | null = start
      for (let count = 1; page; count++) {
        next.push(page)
        const nextUrl: string | undefined = count < step.maxPages ? page.links(step.next)[0] : undefined
        page = nextUrl ? await load(nextUrl) : null
      }
    }
    current = next
  }

  const { each, fields } = job.extract
  const records = current.flatMap((page) => {
    const items = each ? page.extract({ items: { each, fields } }).items : [page.extract(fields)]
    return items.map((data): ScrapedRecord => ({ url: page.url, data }))
  })

  return { startedAt, finishedAt: new Date().toISOString(), pages, records, errors } satisfies JobRun
}
