// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createCollection, type KeyValueStore } from '../core/storage'
import type { Job, ScrapedRecord } from './jobs'
import { testScraper } from './testSite'
import { diffRecords, isDue, runDueJobs, watchJob, type JobState, type RecordChanges } from './watch'

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value)
    },
  }
}

function record(data: Record<string, unknown>): ScrapedRecord {
  return { url: 'https://example.com/', data }
}

const news: Job = {
  id: 'news',
  name: 'News',
  urls: ['https://example.com/news'],
  steps: [],
  extract: { each: 'li', fields: { title: 'a', link: { selector: 'a', attr: 'href' } } },
  key: 'link',
  everyMinutes: 60,
}

function setup(replies: (string | { status: number })[]) {
  const notices: RecordChanges[] = []
  const options = {
    scraper: testScraper({ 'https://example.com/news': replies }, { minDelayMs: 0, retries: 0 }).scraper,
    states: createCollection<JobState>('states', memoryStore()),
    notify: async (_job: Job, changes: RecordChanges) => notices.push(changes),
  }
  return { options, notices }
}

describe('diffRecords', () => {
  const before = [record({ link: '/a', title: 'A' }), record({ link: '/b', title: 'B' })]
  const after = [record({ link: '/a', title: 'A, updated' }), record({ link: '/c', title: 'C' })]

  it('matches records by the key field', () => {
    expect(diffRecords(before, after, 'link')).toEqual({
      added: [after[1]],
      removed: [before[1]],
      changed: [after[0]],
    })
  })

  it('compares whole records without a key', () => {
    expect(diffRecords(before, after)).toEqual({ added: after, removed: before, changed: [] })
  })
})

describe('isDue', () => {
  const now = new Date('2026-11-02T12:00:00Z')
  const state = (lastRunAt: string): JobState => ({ id: 'news', lastRunAt, lastErrors: [], records: [] })

  it('runs scheduled jobs that have never run', () => {
    expect(isDue(news, undefined, now)).toBe(true)
  })

  it('waits for everyMinutes since the last run', () => {
    expect(isDue(news, state('2026-11-02T11:30:00Z'), now)).toBe(false)
    expect(isDue(news, state('2026-11-02T11:00:00Z'), now)).toBe(true)
  })

  it('never runs unscheduled jobs', () => {
    expect(isDue({ ...news, everyMinutes: undefined }, undefined, now)).toBe(false)
  })
})

describe('watchJob', () => {
  const first = '<li><a href="/a">A</a></li>'
  const second = '<li><a href="/a">A</a></li><li><a href="/b">B</a></li>'

  it('keeps the first run as the baseline without notifying', async () => {
    const { options, notices } = setup([first])
    const { changes } = await watchJob(news, options)

    expect(changes).toBeNull()
    expect(notices).toEqual([])
    expect((await options.states.list())[0]?.records).toHaveLength(1)
  })

  it('notifies about records that are new since the last run', async () => {
    const { options, notices } = setup([first, second])
    await watchJob(news, options)
    await watchJob(news, options)

    const added = { url: 'https://example.com/news', data: { title: 'B', link: 'https://example.com/b' } }
    expect(notices).toEqual([{ added: [added], removed: [], changed: [] }])
  })

  it('keeps the baseline when a run has errors', async () => {
    const { options, notices } = setup([first, { status: 503 }, second])
    await watchJob(news, options)
    const failed = await watchJob(news, options)
    await watchJob(news, options)

    expect(failed.changes).toBeNull()
    expect(notices).toHaveLength(1)
    expect(notices[0]?.added).toHaveLength(1)
  })

  it('records a broken selector as an error instead of throwing', async () => {
    const { options } = setup([first])
    const { run } = await watchJob({ ...news, extract: { fields: { title: 'li[' } } }, options)

    expect(run.errors).toEqual([{ url: 'https://example.com/news', message: 'Invalid CSS selector: li[' }])
    expect((await options.states.list())[0]?.lastErrors).toEqual(run.errors)
  })
})

describe('runDueJobs', () => {
  it('runs only the jobs that are due', async () => {
    const { options } = setup([''])
    const jobs = createCollection<Job>('jobs', memoryStore())
    await jobs.save(news)
    await jobs.save({ ...news, id: 'manual', everyMinutes: undefined })

    expect(await runDueJobs({ ...options, jobs })).toBe(1)
    expect(await runDueJobs({ ...options, jobs })).toBe(0)
    expect((await options.states.list()).map(({ id }) => id)).toEqual(['news'])
  })
})
