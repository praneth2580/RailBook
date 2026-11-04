import { describe, expect, it } from 'vitest'
import { pathOf, PATHS, url, URLS } from './urls'

describe('urls', () => {
  it('builds the official addresses from their parts', () => {
    expect(URLS).toEqual({
      trainSearch: 'https://www.irctc.co.in/nget/train-search',
      pnrEnquiry: 'https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en',
    })
    expect(url('https://example.com', PATHS.trainSearch, { from: 'NDLS', to: 'MMCT' })).toBe(
      'https://example.com/nget/train-search?from=NDLS&to=MMCT',
    )
  })

  it('gives the path of an address to compare with PATHS', () => {
    expect(pathOf('https://example.com/nget/train-search/?from=NDLS#top')).toBe(PATHS.trainSearch)
    expect(pathOf('https://example.com')).toBe('/')
    expect(pathOf('not an address')).toBe('')
  })
})
