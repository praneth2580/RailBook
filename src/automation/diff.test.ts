import { describe, expect, it } from 'vitest'
import { compareRecords, isDue } from './diff'
import type { Job, ScrapedRecord } from './jobs'

const record = (data: Record<string, unknown>): ScrapedRecord => ({ url: 'https://example.com/', data })

describe('compareRecords', () => {
  const before = [record({ link: '/a', title: 'A' }), record({ link: '/b', title: 'B' })]
  const after = [record({ link: '/a', title: 'A, updated' }), record({ link: '/c', title: 'C' })]

  it('matches records by the key field', () => {
    expect(compareRecords(before, after, 'link')).toEqual({
      changes: ['changed', 'added'],
      added: 1,
      changed: 1,
      removed: 1,
    })
  })

  it('compares whole records without a key', () => {
    expect(compareRecords(before, after)).toEqual({ changes: ['added', 'added'], added: 2, changed: 0, removed: 2 })
  })

  it('reports nothing for an identical run', () => {
    expect(compareRecords(before, before, 'link')).toMatchObject({ added: 0, changed: 0, removed: 0 })
  })
})

describe('isDue', () => {
  const job = { everyMinutes: 60 } as Job
  const now = new Date('2026-11-02T12:00:00Z')

  it('runs scheduled jobs that have never run', () => {
    expect(isDue(job, undefined, now)).toBe(true)
  })

  it('waits for everyMinutes since the last run', () => {
    expect(isDue(job, '2026-11-02T11:30:00Z', now)).toBe(false)
    expect(isDue(job, '2026-11-02T11:00:00Z', now)).toBe(true)
  })

  it('never runs unscheduled jobs', () => {
    expect(isDue({} as Job, undefined, now)).toBe(false)
  })
})
