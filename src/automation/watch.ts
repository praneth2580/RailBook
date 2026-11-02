import { createCollection, type Collection } from '../core/storage'
import { showNotice } from '../platform/alerts'
import { runJob, type Job, type JobRun, type RunError, type ScrapedRecord } from './jobs'
import { createScraper, type Scraper } from './scraper'

/** What's kept between runs of one job. */
export interface JobState {
  /** The job's id. */
  id: string
  lastRunAt: string
  lastErrors: RunError[]
  /**
   * Records from the latest run that finished without errors, or null before the first one.
   * Runs with errors leave them alone, so a page that failed to load doesn't look like removed items.
   */
  records: ScrapedRecord[] | null
}

export interface RecordChanges {
  added: ScrapedRecord[]
  removed: ScrapedRecord[]
  /** Only found when the job has a key field, since otherwise a changed record looks new. */
  changed: ScrapedRecord[]
}

// Preferences suits a few hundred records per job, not whole sites.
export const jobCollection = createCollection<Job>('automationJobs')
export const jobStateCollection = createCollection<JobState>('automationJobStates')

export function diffRecords(before: ScrapedRecord[], after: ScrapedRecord[], key?: string): RecordChanges {
  const identity = ({ data }: ScrapedRecord) =>
    key && data[key] != null ? `key:${String(data[key])}` : `record:${JSON.stringify(data)}`
  const previous = new Map(before.map((record) => [identity(record), record]))
  const current = new Set(after.map(identity))

  return {
    added: after.filter((record) => !previous.has(identity(record))),
    removed: before.filter((record) => !current.has(identity(record))),
    changed: after.filter((record) => {
      const old = previous.get(identity(record))
      return old !== undefined && JSON.stringify(old.data) !== JSON.stringify(record.data)
    }),
  }
}

/** Due by its last attempt, not its last success, so a failing site isn't retried on every check. */
export function isDue(job: Job, state: JobState | undefined, now: Date) {
  if (!job.everyMinutes) return false
  return !state || now.getTime() - Date.parse(state.lastRunAt) >= job.everyMinutes * 60_000
}

function describeChanges({ added, changed }: RecordChanges) {
  return [added.length > 0 && `${added.length} new`, changed.length > 0 && `${changed.length} changed`]
    .filter(Boolean)
    .join(', ')
}

export interface WatchOptions {
  scraper?: Scraper
  states?: Collection<JobState>
  /** Called when a run finds new or changed records. Defaults to a notification. */
  notify?: (job: Job, changes: RecordChanges) => Promise<unknown>
  signal?: AbortSignal
}

/** changes is null on the first complete run and on runs with errors, since there's nothing reliable to compare. */
export async function watchJob(
  job: Job,
  {
    scraper = createScraper(),
    states = jobStateCollection,
    notify = (watched, changes) => showNotice(`automation:${watched.id}`, watched.name, describeChanges(changes)),
    signal,
  }: WatchOptions = {},
): Promise<{ run: JobRun; changes: RecordChanges | null }> {
  const previous = (await states.list()).find(({ id }) => id === job.id)
  const startedAt = new Date().toISOString()
  let run: JobRun
  try {
    run = await runJob(job, scraper, { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    // A bad selector fails the whole run. Record it like any other error so the job isn't retried on every check.
    const message = error instanceof Error ? error.message : String(error)
    run = { startedAt, finishedAt: new Date().toISOString(), pages: 0, records: [], errors: [{ url: job.urls[0] ?? '', message }] }
  }
  const complete = run.errors.length === 0
  const changes = complete && previous?.records ? diffRecords(previous.records, run.records, job.key) : null

  await states.save({
    id: job.id,
    lastRunAt: run.startedAt,
    lastErrors: run.errors,
    records: complete ? run.records : (previous?.records ?? null),
  })
  if (changes && (changes.added.length > 0 || changes.changed.length > 0)) await notify(job, changes)
  return { run, changes }
}

/**
 * Runs every saved job whose everyMinutes has passed, one after another. Nothing runs in the background:
 * call it while the app is open, for example on launch, on resume or from a timer.
 */
export async function runDueJobs({
  jobs = jobCollection,
  now = new Date(),
  ...options
}: WatchOptions & { jobs?: Collection<Job>; now?: Date } = {}) {
  const states = await (options.states ?? jobStateCollection).list()
  const scraper = options.scraper ?? createScraper()
  const due = (await jobs.list()).filter((job) => isDue(job, states.find(({ id }) => id === job.id), now))
  for (const job of due) {
    options.signal?.throwIfAborted()
    await watchJob(job, { ...options, scraper })
  }
  return due.length
}
