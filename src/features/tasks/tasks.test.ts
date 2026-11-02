import { describe, expect, it } from 'vitest'
import type { Journey } from '../../core/types'
import { passengerLimit, taskStatus } from './tasks'

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

const at = (iso: string) => new Date(iso).getTime()

describe('taskStatus', () => {
  it('is scheduled before the window opens', () => {
    expect(taskStatus(journey, at('2026-12-14T09:59:59+05:30'))).toBe('scheduled')
  })

  it('is open from the window until the journey day ends', () => {
    expect(taskStatus(journey, at('2026-12-14T10:00:00+05:30'))).toBe('open')
    expect(taskStatus(journey, at('2026-12-15T23:59:00+05:30'))).toBe('open')
  })

  it('expires after the journey day', () => {
    expect(taskStatus(journey, at('2026-12-16T00:00:00+05:30'))).toBe('expired')
  })

  it('reports a recorded outcome whatever the time', () => {
    const outcome = { result: 'booked', pnr: '1234567890', at: '2026-12-14T04:32:00Z', seconds: 120 } as const
    expect(taskStatus({ ...journey, outcome }, at('2026-12-20T00:00:00+05:30'))).toBe('booked')
  })
})

describe('passengerLimit', () => {
  it('allows four on Tatkal and six on General', () => {
    expect(passengerLimit('Tatkal')).toBe(4)
    expect(passengerLimit('Premium Tatkal')).toBe(4)
    expect(passengerLimit('General')).toBe(6)
  })
})
