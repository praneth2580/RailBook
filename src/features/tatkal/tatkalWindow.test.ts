import { describe, expect, it } from 'vitest'
import { bookingOpensAt, formatCountdown, tatkalOpensAt } from './tatkalWindow'

describe('tatkalOpensAt', () => {
  it('opens AC classes at 10:00 IST the day before', () => {
    expect(tatkalOpensAt('2026-12-15', '3A').toISOString()).toBe('2026-12-14T04:30:00.000Z')
  })

  it('opens non-AC classes at 11:00 IST the day before', () => {
    expect(tatkalOpensAt('2026-12-15', 'SL').toISOString()).toBe('2026-12-14T05:30:00.000Z')
  })

  it('crosses month and year boundaries', () => {
    expect(tatkalOpensAt('2027-01-01', '2A').toISOString()).toBe('2026-12-31T04:30:00.000Z')
  })
})

describe('bookingOpensAt', () => {
  it('treats Premium Tatkal like Tatkal', () => {
    expect(bookingOpensAt('2026-12-15', '3A', 'Premium Tatkal').toISOString()).toBe('2026-12-14T04:30:00.000Z')
  })

  it('opens General quota at 08:00 IST 60 days ahead', () => {
    expect(bookingOpensAt('2027-01-30', 'SL', 'General').toISOString()).toBe('2026-12-01T02:30:00.000Z')
  })

  it('defaults to Tatkal for journeys saved without a quota', () => {
    expect(bookingOpensAt('2026-12-15', 'SL').toISOString()).toBe('2026-12-14T05:30:00.000Z')
  })
})

describe('formatCountdown', () => {
  it('shows hours, minutes and seconds', () => {
    expect(formatCountdown(3_661_000)).toBe('01:01:01')
  })

  it('shows days when more than 24 hours remain', () => {
    expect(formatCountdown(90_000_000)).toBe('1d 01:00:00')
  })

  it('rounds up so it never shows zero early', () => {
    expect(formatCountdown(1)).toBe('00:00:01')
  })

  it('reports an open window', () => {
    expect(formatCountdown(0)).toBe('Open now')
    expect(formatCountdown(-5000)).toBe('Open now')
  })
})
