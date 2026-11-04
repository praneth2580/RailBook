import { describe, expect, it } from 'vitest'
import { helpersForPage, skipLanguageModalIfPresent } from './siteActions'

describe('helpersForPage', () => {
  it('skips the language popup on the train search page, on any domain', () => {
    for (const address of [
      'https://www.irctc.co.in/nget/train-search',
      'https://example.com/nget/train-search/',
      'http://127.0.0.1:5000/nget/train-search?from=NDLS#top',
    ]) {
      expect(helpersForPage(address)).toEqual([skipLanguageModalIfPresent])
    }
  })

  it('has nothing for other pages or for what is not an address', () => {
    expect(helpersForPage('https://www.irctc.co.in/nget/profile')).toEqual([])
    expect(helpersForPage('https://www.irctc.co.in/nget/train-search/results')).toEqual([])
    expect(helpersForPage('not a url')).toEqual([])
  })
})
