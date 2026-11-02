// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { testScraper } from './testSite'

describe('createScraper', () => {
  it('reads a page and extracts from it', async () => {
    const { scraper } = testScraper({
      'https://example.com/': '<h1>Hello</h1><a href="/a#top">A</a><a href="/a">Again</a><a href="mailto:me@example.com">Mail</a>',
    })
    const page = await scraper.get('https://example.com/')

    expect(page.extract({ title: 'h1' })).toEqual({ title: 'Hello' })
    expect(page.links('a')).toEqual(['https://example.com/a'])
  })

  it('reads JSON', async () => {
    const { scraper } = testScraper({ 'https://api.example/trains': '[{"number":"12951"}]' })
    expect((await scraper.get('https://api.example/trains')).json()).toEqual([{ number: '12951' }])
  })

  it('asks for rendered pages, but reads robots.txt as it is', async () => {
    const { scraper, requests, rendered } = testScraper({ 'https://app.example/': '<p>ok</p>' })

    await scraper.get('https://app.example/', { render: { waitFor: '.ready' } })
    expect(requests).toEqual(['https://app.example/robots.txt', 'https://app.example/'])
    expect(rendered).toEqual([{ url: 'https://app.example/', waitFor: '.ready', timeoutMs: 30_000 }])
  })

  it('never requests blocked hosts', async () => {
    const { scraper, requests } = testScraper({}, { blockedHosts: ['example.org'] })

    await expect(scraper.get('https://www.irctc.co.in/nget/train-search')).rejects.toThrow(
      "RailBook doesn't scrape www.irctc.co.in.",
    )
    await expect(scraper.get('https://example.org/')).rejects.toThrow("RailBook doesn't scrape example.org.")
    expect(requests).toEqual([])
  })

  it('rejects pages that redirect to a blocked host', async () => {
    const { scraper } = testScraper({ 'https://short.example/x': { url: 'https://www.irctc.co.in/' } })
    await expect(scraper.get('https://short.example/x')).rejects.toThrow("RailBook doesn't scrape www.irctc.co.in.")
  })

  it('rejects addresses it cannot read', async () => {
    const { scraper } = testScraper({})
    await expect(scraper.get('not a url')).rejects.toThrow('Not a web address: not a url')
    await expect(scraper.get('ftp://example.com/file')).rejects.toThrow('Only http and https pages can be read.')
  })

  it('follows robots.txt and fetches it once per site', async () => {
    const { scraper, requests } = testScraper({
      'https://example.com/robots.txt': 'User-agent: *\nDisallow: /private',
      'https://example.com/public': '<p>ok</p>',
    })

    await expect(scraper.get('https://example.com/private/page')).rejects.toThrow(
      "example.com/robots.txt doesn't allow reading /private/page.",
    )
    await scraper.get('https://example.com/public')
    expect(requests).toEqual(['https://example.com/robots.txt', 'https://example.com/public'])
  })

  it('treats a robots.txt that keeps failing as disallowing everything', async () => {
    const { scraper, requests } = testScraper(
      { 'https://example.com/robots.txt': { status: 500 }, 'https://example.com/': '<p>ok</p>' },
      { minDelayMs: 0 },
    )

    await expect(scraper.get('https://example.com/')).rejects.toThrow("Couldn't read example.com/robots.txt")
    expect(requests).toEqual(Array(3).fill('https://example.com/robots.txt'))
  })

  it('waits between requests to the same host', async () => {
    const { scraper, waits } = testScraper(
      { 'https://example.com/a': 'a', 'https://example.com/b': 'b', 'https://other.example/c': 'c' },
      { minDelayMs: 2000 },
    )

    await scraper.get('https://example.com/a')
    await scraper.get('https://example.com/b')
    await scraper.get('https://other.example/c')
    // robots.txt for each host goes first; the first request to a host doesn't wait.
    expect(waits).toEqual([2000, 2000, 2000])
  })

  it('waits longer when robots.txt sets a Crawl-delay', async () => {
    const { scraper, waits } = testScraper({
      'https://example.com/robots.txt': 'User-agent: *\nCrawl-delay: 5',
      'https://example.com/a': 'a',
      'https://example.com/b': 'b',
    })

    await scraper.get('https://example.com/a')
    await scraper.get('https://example.com/b')
    expect(waits).toEqual([1000, 5000])
  })

  it('retries server errors, honouring Retry-After', async () => {
    const { scraper, requests, waits } = testScraper(
      { 'https://example.com/': [{ status: 503, headers: { 'retry-after': '3' } }, { status: 500 }, '<p>ok</p>'] },
      { minDelayMs: 0 },
    )

    expect((await scraper.get('https://example.com/')).text).toBe('<p>ok</p>')
    expect(waits).toEqual([3000, 2000])
    expect(requests.filter((url) => url === 'https://example.com/')).toHaveLength(3)
  })

  it('reports the status once retries run out', async () => {
    const { scraper } = testScraper({ 'https://example.com/': { status: 503 } }, { retries: 1, minDelayMs: 0 })
    await expect(scraper.get('https://example.com/')).rejects.toMatchObject({
      name: 'ScrapeError',
      message: 'example.com answered 503.',
      status: 503,
    })
  })

  it("doesn't retry other client errors", async () => {
    const { scraper, requests } = testScraper({ 'https://example.com/gone': { status: 410 } })
    await expect(scraper.get('https://example.com/gone')).rejects.toMatchObject({ status: 410 })
    expect(requests).toEqual(['https://example.com/robots.txt', 'https://example.com/gone'])
  })

  it('retries network errors, then reports them', async () => {
    const { scraper, requests } = testScraper({ 'https://example.com/': new Error('Offline.') }, { retries: 1, minDelayMs: 0 })
    await expect(scraper.get('https://example.com/')).rejects.toThrow("Couldn't read example.com. Offline.")
    expect(requests).toHaveLength(3)
  })

  it('rejects with the abort reason when cancelled, and can be used again', async () => {
    const { scraper } = testScraper({ 'https://example.com/': '<p>ok</p>' })
    const controller = new AbortController()
    controller.abort()

    await expect(scraper.get('https://example.com/', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect((await scraper.get('https://example.com/')).text).toBe('<p>ok</p>')
  })
})
