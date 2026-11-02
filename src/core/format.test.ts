import { describe, expect, it } from 'vitest'
import { formatDuration, formatElapsed, formatPnr, initials, todayIso } from './format'

describe('formatPnr', () => {
  it('splits the PNR the way tickets print it', () => {
    expect(formatPnr('1234567890')).toBe('123-4567890')
  })
})

describe('formatDuration', () => {
  it('shows seconds alone under a minute', () => {
    expect(formatDuration(42)).toBe('42s')
  })

  it('shows minutes and seconds', () => {
    expect(formatDuration(134)).toBe('2m 14s')
  })
})

describe('formatElapsed', () => {
  it('pads minutes and seconds', () => {
    expect(formatElapsed(65_400)).toBe('01:05')
  })

  it('never goes negative', () => {
    expect(formatElapsed(-1000)).toBe('00:00')
  })
})

describe('initials', () => {
  it('uses the first two words', () => {
    expect(initials('asha  devi rao')).toBe('AD')
    expect(initials('Ravi')).toBe('R')
  })
})

describe('todayIso', () => {
  it('uses the IST date even when UTC is still on the day before', () => {
    expect(todayIso(new Date('2026-12-14T20:00:00Z').getTime())).toBe('2026-12-15')
  })
})
