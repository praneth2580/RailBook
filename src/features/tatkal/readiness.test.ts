import { describe, expect, it } from 'vitest'
import type { Journey } from '../../core/types'
import { readinessChecks } from './readiness'

const journey: Journey = {
  id: 'journey',
  trainNumber: '10000',
  backupTrainNumber: '',
  travelClass: '3A',
  date: '2026-12-15',
  from: 'A',
  to: 'B',
  boardingStation: '',
  passengerIds: [],
  confirmedChecks: [],
}

const doneIds = (target: Journey) =>
  readinessChecks(target)
    .filter(({ done }) => done)
    .map(({ id }) => id)

describe('readinessChecks', () => {
  it('starts with nothing done', () => {
    expect(doneIds(journey)).toEqual([])
  })

  it('derives automatic checks from the journey', () => {
    expect(doneIds({ ...journey, passengerIds: ['p1'], backupTrainNumber: '10001' })).toEqual([
      'passengers',
      'backup-train',
    ])
  })

  it('uses confirmed ids for manual checks', () => {
    expect(doneIds({ ...journey, confirmedChecks: ['payment'] })).toEqual(['payment'])
  })
})
