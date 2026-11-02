// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { runJob, type Job } from './jobs'
import { testScraper } from './testSite'

const SHOP = {
  'https://shop.example/list?page=1':
    '<article><a href="/p/1">One</a></article><article><a href="/p/2">Two</a></article><a class="next" href="/list?page=2">Next</a>',
  'https://shop.example/list?page=2': '<article><a href="/p/3">Three</a></article><a class="next" href="/list?page=3">Next</a>',
  'https://shop.example/list?page=3': '<article><a href="/p/4">Four</a></article><a class="next" href="/list?page=1">Again</a>',
  'https://shop.example/p/1': '<h1>One</h1><span class="price">10</span>',
  'https://shop.example/p/3': '<h1>Three</h1><span class="price">30</span>',
  'https://shop.example/p/4': '<h1>Four</h1><span class="price">40</span>',
}

const listing = { each: 'article', fields: { name: 'a', link: { selector: 'a', attr: 'href' } } }

function job(overrides: Partial<Job>): Job {
  return { id: 'job', name: 'Shop', urls: ['https://shop.example/list?page=1'], steps: [], extract: listing, ...overrides }
}

describe('runJob', () => {
  it('extracts one record per matching element', async () => {
    const run = await runJob(job({}), testScraper(SHOP).scraper)

    expect(run.records).toEqual([
      { url: 'https://shop.example/list?page=1', data: { name: 'One', link: 'https://shop.example/p/1' } },
      { url: 'https://shop.example/list?page=1', data: { name: 'Two', link: 'https://shop.example/p/2' } },
    ])
    expect(run.errors).toEqual([])
    expect(run.pages).toBe(1)
  })

  it('follows next links up to maxPages', async () => {
    const run = await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 2 }] }), testScraper(SHOP).scraper)
    expect(run.records.map(({ data }) => data.name)).toEqual(['One', 'Two', 'Three'])
  })

  it("doesn't loop back to pages it has already read", async () => {
    const run = await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 10 }] }), testScraper(SHOP).scraper)
    expect(run.records.map(({ data }) => data.name)).toEqual(['One', 'Two', 'Three', 'Four'])
    expect(run.pages).toBe(3)
  })

  it('reads the pages that links lead to, and keeps going past ones that fail', async () => {
    const run = await runJob(
      job({
        steps: [
          { type: 'paginate', next: 'a.next', maxPages: 2 },
          { type: 'follow', links: 'article a', max: 2 },
        ],
        extract: { fields: { name: 'h1', price: '.price' } },
      }),
      testScraper(SHOP).scraper,
    )

    expect(run.records).toEqual([
      { url: 'https://shop.example/p/1', data: { name: 'One', price: '10' } },
      { url: 'https://shop.example/p/3', data: { name: 'Three', price: '30' } },
    ])
    expect(run.errors).toEqual([{ url: 'https://shop.example/p/2', message: 'shop.example answered 404.' }])
  })

  it('stops at the page limit and says so', async () => {
    const pagesRead: string[] = []
    const run = await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 10 }] }), testScraper(SHOP).scraper, {
      pageLimit: 2,
      onPage: (url) => pagesRead.push(url),
    })

    expect(pagesRead).toEqual(['https://shop.example/list?page=1', 'https://shop.example/list?page=2'])
    expect(run.errors).toEqual([{ url: 'https://shop.example/list?page=3', message: 'Stopped at the 2-page limit.' }])
  })

  it('renders every page when the job asks for it', async () => {
    const { scraper, rendered } = testScraper(SHOP)
    await runJob(job({ render: true, steps: [{ type: 'paginate', next: 'a.next', maxPages: 2 }] }), scraper)
    expect(rendered.map(({ url }) => url)).toEqual(['https://shop.example/list?page=1', 'https://shop.example/list?page=2'])
  })

  it('rejects when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runJob(job({}), testScraper(SHOP).scraper, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
