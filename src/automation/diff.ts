import type { Job, ScrapedRecord } from './jobs'

export type RecordChange = 'added' | 'changed' | null

function identityOf(key: string | undefined) {
  return ({ data }: ScrapedRecord) =>
    key && data[key] != null ? `key:${String(data[key])}` : `record:${JSON.stringify(data)}`
}

/**
 * Labels each record in after against before. A changed record can only be told apart from a new one when the job
 * has a key field; without one, any change looks like a removal plus an addition.
 */
export function compareRecords(before: ScrapedRecord[], after: ScrapedRecord[], key?: string) {
  const identity = identityOf(key)
  const previous = new Map(before.map((record) => [identity(record), record]))
  const current = new Set(after.map(identity))

  const changes: RecordChange[] = after.map((record) => {
    const old = previous.get(identity(record))
    if (!old) return 'added'
    return key && JSON.stringify(old.data) !== JSON.stringify(record.data) ? 'changed' : null
  })
  const removed = before.filter((record) => !current.has(identity(record))).length
  return {
    changes,
    added: changes.filter((change) => change === 'added').length,
    changed: changes.filter((change) => change === 'changed').length,
    removed,
  }
}

/** Due by its last attempt, not its last success, so a failing site isn't retried on every check. */
export function isDue(job: Job, lastRunAt: string | undefined, now: Date) {
  if (!job.everyMinutes) return false
  return !lastRunAt || now.getTime() - Date.parse(lastRunAt) >= job.everyMinutes * 60_000
}
