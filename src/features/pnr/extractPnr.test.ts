import { describe, expect, it } from 'vitest'
import { extractPnr } from './extractPnr'

describe('extractPnr', () => {
  it('finds a labelled PNR in an SMS', () => {
    expect(extractPnr('PNR:1234567890,TRAIN:10000,DOJ:15-12-26')).toBe('1234567890')
    expect(extractPnr('Your PNR No. 123-4567890 is confirmed')).toBe('1234567890')
  })

  it('accepts a number on its own', () => {
    expect(extractPnr('  1234567890\n')).toBe('1234567890')
  })

  it('ignores unlabelled numbers such as phone numbers', () => {
    expect(extractPnr('Call 9876543210 for help')).toBeNull()
  })

  it('rejects numbers of the wrong length', () => {
    expect(extractPnr('PNR 12345678901')).toBeNull()
    expect(extractPnr('12345')).toBeNull()
  })
})
