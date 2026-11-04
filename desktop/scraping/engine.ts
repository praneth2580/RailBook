import { runJob, validateJob, type Job } from '../../src/automation/jobs'
import { ApiError } from '../apiError'
import { createWraithLoader, type LoaderOptions } from './loader'

const PREVIEW_RECORDS = 50

function parseJob(input: unknown): Job {
  const { job, errors } = validateJob(input)
  if (!job) throw new ApiError(400, errors.join(' '))
  return job
}

/** The scraping API the launcher serves: jobs arrive as JSON from the window, and run here with WRAITH. */
export function createScrapingEngine(options: LoaderOptions) {
  const loader = createWraithLoader(options)

  return {
    /** Reads only the first start page, with the job's loading and extraction settings, to check them while editing. */
    async preview(input: unknown, signal: AbortSignal) {
      const job = parseJob(input)
      const first = job.urls[0]
      const run = await runJob(
        first
          ? { ...job, urls: [first], sitemap: undefined, steps: [], pageLimit: 1 }
          : { ...job, sitemap: job.sitemap && { ...job.sitemap, max: 1 }, steps: [], pageLimit: 2 },
        loader,
        { signal },
      )
      return {
        url: run.records[0]?.url ?? first ?? job.sitemap?.url,
        total: run.records.length,
        records: run.records.slice(0, PREVIEW_RECORDS),
        errors: run.errors,
      }
    },
    run: async (input: unknown, signal: AbortSignal) => runJob(parseJob(input), loader, { signal }),
    close: () => loader.close(),
  }
}

export type ScrapingEngine = ReturnType<typeof createScrapingEngine>
