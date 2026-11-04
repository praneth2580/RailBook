import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runJob, type Job } from '../../src/automation/jobs'
import { findChrome } from '../chrome'
import { createScrapingEngine } from './engine'
import { createWraithLoader } from './loader'

type Route = string | { status?: number; type?: string; body?: string; location?: string }

const servers: Server[] = []

/** A local site. Routes not listed answer 404; {origin} in a body becomes the site's own address. */
async function site(routes: Record<string, Route>) {
  const server = createServer((request, response) => {
    const route = routes[request.url ?? '/']
    if (route === undefined) return response.writeHead(404).end('Not found')
    const {
      status = 200,
      type = 'text/html',
      body = '',
      location,
    } = typeof route === 'string' ? { body: route } : route
    const headers: Record<string, string> = { 'Content-Type': type }
    if (location) headers.Location = location
    response.writeHead(status, headers).end(body.replaceAll('{origin}', origin))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return origin
}

const chrome = findChrome()
// A short gap keeps the tests quick; the rate limit itself is WRAITH's and tested there.
const loader = createWraithLoader({ executablePath: chrome ?? '', minDelayMs: 10, timeoutMs: 10_000 })
let shop = ''
let other = ''

beforeAll(async () => {
  other = await site({ '/x': '<h1>X</h1>' })
  shop = await site({
    '/robots.txt': { type: 'text/plain', body: 'User-agent: *\nDisallow: /private' },
    '/list?page=1':
      '<article><a href="/p/1">One</a><span class="tag">a</span><span class="tag">b</span></article><article><a href="/p/2">Two</a></article><a class="next" href="/list?page=2">Next</a>',
    '/list?page=2': '<article><a href="/p/3">Three</a></article><a class="next" href="/list?page=3">Next</a>',
    '/list?page=3': '<article><a href="/p/4">Four</a></article><a class="next" href="/list?page=1">Again</a>',
    '/p/1': '<h1>One</h1><p>Price: <b>10</b></p>',
    '/p/3': '<h1>Three</h1><p>Price: <b>30</b></p>',
    '/p/4': '<h1>Four</h1>',
    '/home': `<h1>Home</h1><a href="/a">A</a><a href="/b">B</a><a href="/c/secret">C</a><a href="${other.replace('http', 'http')}/x">X</a><a href="https://www.irctc.co.in/">IRCTC</a>`,
    '/a': '<h1>A</h1><a href="/a/1">A1</a><a href="/home">Home</a>',
    '/b': '<h1>B</h1>',
    '/c/secret': '<h1>C</h1>',
    '/a/1': '<h1>A1</h1>',
    '/sitemap.xml': {
      type: 'application/xml',
      body: '<sitemapindex><sitemap><loc>{origin}/pages.xml</loc></sitemap></sitemapindex>',
    },
    '/pages.xml': {
      type: 'application/xml',
      body: '<urlset><url><loc>{origin}/a</loc></url><url><loc>{origin}/b</loc></url><url><loc>{origin}/a/1</loc></url></urlset>',
    },
    '/api/items': {
      type: 'application/json',
      body: JSON.stringify({
        data: {
          items: [
            { name: 'Tea', price: { amount: 120 } },
            { name: 'Coffee', price: { amount: 150 } },
          ],
        },
      }),
    },
    '/private/x': '<h1>Hidden</h1>',
    // Rendered pages: content built by scripts, a "Load more" button, a search form and an infinite feed.
    '/app': '<div id="app"></div><script>setTimeout(() => app.innerHTML = "<h1>Built by a script</h1>", 200)</script>',
    '/more': `<ul id="list"><li>1</li><li>2</li></ul><button class="more">Load more</button><script>
      let page = 0
      document.querySelector('.more').addEventListener('click', async () => {
        const { items, last } = await (await fetch('/api/more/' + ++page)).json()
        for (const item of items) list.insertAdjacentHTML('beforeend', '<li>' + item + '</li>')
        if (last) document.querySelector('.more').remove()
      })</script>`,
    '/api/more/1': { type: 'application/json', body: '{"items":[11,12],"last":false}' },
    '/api/more/2': { type: 'application/json', body: '{"items":[21,22],"last":true}' },
    '/search': '<form action="/results"><input name="q"><button>Search</button></form>',
    '/results?q=rail': '<h1>Results for rail</h1>',
    '/feed': `<div id="feed"></div><script>
      let shown = 0
      const add = () => { for (let i = 0; i < 10; i++) feed.insertAdjacentHTML('beforeend', '<p class="row" style="height:300px">Row ' + shown++ + '</p>') }
      add()
      addEventListener('scroll', () => { if (shown < 30 && innerHeight + scrollY >= document.body.scrollHeight - 50) setTimeout(add, 100) })</script>`,
    '/phones-home': `<p id="result">waiting</p><script>
      fetch('https://www.irctc.co.in/robots.txt').then(() => result.textContent = 'reached', () => result.textContent = 'blocked')</script>`,
  })
})

afterAll(async () => {
  await loader.close()
  for (const server of servers) server.closeAllConnections()
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
})

const job = (overrides: Partial<Job>): Job => ({
  id: 'job',
  name: 'Shop',
  urls: [`${shop}/list?page=1`],
  steps: [],
  extract: { each: 'article', fields: { name: 'a', link: 'a@href', tags: { selector: '.tag', list: true } } },
  concurrency: 1,
  ...overrides,
})
const names = (run: { records: { data: Record<string, unknown> }[] }, field = 'name') =>
  run.records.map(({ data }) => data[field])

describe('runJob with WRAITH, plain pages', () => {
  it('extracts one record per element, with absolute links and lists', async () => {
    const run = await runJob(job({}), loader)
    expect(run.records).toEqual([
      { url: `${shop}/list?page=1`, data: { name: 'One', link: `${shop}/p/1`, tags: ['a', 'b'] } },
      { url: `${shop}/list?page=1`, data: { name: 'Two', link: `${shop}/p/2`, tags: [] } },
    ])
    expect(run.errors).toEqual([])
  })

  it('follows next links up to maxPages without looping back', async () => {
    expect(names(await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 2 }] }), loader))).toEqual([
      'One',
      'Two',
      'Three',
    ])
    const all = await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 10 }] }), loader)
    expect(names(all)).toEqual(['One', 'Two', 'Three', 'Four'])
    expect(all.pages).toBe(3)
  })

  it('opens detail pages, reads values next to labels, and carries on past pages that fail', async () => {
    const run = await runJob(
      job({
        steps: [
          { type: 'paginate', next: 'a.next', maxPages: 2 },
          { type: 'follow', links: 'article a', max: 2 },
        ],
        extract: { fields: { name: 'h1', price: { near: 'Price' } } },
      }),
      loader,
    )
    expect(run.records.map(({ data }) => data)).toEqual([
      { name: 'One', price: '10' },
      { name: 'Three', price: '30' },
    ])
    expect(run.errors).toEqual([{ url: `${shop}/p/2`, message: `${new URL(shop).host} answered 404.` }])
  })

  it('stops at the page limit and says so', async () => {
    const run = await runJob(job({ steps: [{ type: 'paginate', next: 'a.next', maxPages: 10 }], pageLimit: 2 }), loader)
    expect(run.pages).toBe(2)
    expect(run.errors).toEqual([{ url: `${shop}/list?page=3`, message: 'Stopped at the 2-page limit.' }])
  })

  it('crawls its own site to the depth asked, or wherever include and exclude allow, never IRCTC', async () => {
    const crawl = (step: Partial<Extract<Job['steps'][number], { type: 'crawl' }>>) =>
      runJob(
        job({
          urls: [`${shop}/home`],
          steps: [{ type: 'crawl', maxDepth: 1, ...step }],
          extract: { fields: { name: 'h1' } },
        }),
        loader,
      )
    expect(names(await crawl({ maxDepth: 1 }))).toEqual(['Home', 'A', 'B', 'C'])
    expect(names(await crawl({ maxDepth: 2 }))).toEqual(['Home', 'A', 'B', 'C', 'A1'])

    const wide = await crawl({ include: [`${shop}/*`, `${other}/*`, 'https://www.irctc.co.in/*'], exclude: ['*/c/*'] })
    expect(names(wide)).toEqual(['Home', 'A', 'B', 'X'])
    expect(wide.errors).toEqual([
      { url: 'https://www.irctc.co.in/', message: "RailBook doesn't scrape www.irctc.co.in." },
    ])
  })

  it('starts from the pages a sitemap index lists, filtered by a pattern', async () => {
    const run = await runJob(
      job({
        urls: [],
        sitemap: { url: `${shop}/sitemap.xml`, match: `${shop}/a*`, max: 5 },
        extract: { fields: { name: 'h1' } },
      }),
      loader,
    )
    expect(names(run)).toEqual(['A', 'A1'])
  })

  it('reads JSON pages by dot paths, and says when a page is not JSON', async () => {
    const run = await runJob(
      job({
        urls: [`${shop}/p/4`, `${shop}/api/items`],
        extract: { from: 'json', each: 'data.items', fields: { name: 'name', price: 'price.amount' } },
      }),
      loader,
    )
    expect(run.records.map(({ data }) => data)).toEqual([
      { name: 'Tea', price: 120 },
      { name: 'Coffee', price: 150 },
    ])
    expect(run.errors).toEqual([{ url: `${shop}/p/4`, message: expect.stringContaining("isn't JSON") }])
  })

  it('keeps page order when loading several pages at once', async () => {
    const run = await runJob(
      job({
        steps: [
          { type: 'paginate', next: 'a.next', maxPages: 3 },
          { type: 'follow', links: 'article a', max: 2 },
        ],
        extract: { fields: { name: 'h1' } },
        concurrency: 4,
      }),
      loader,
    )
    expect(names(run)).toEqual(['One', 'Three', 'Four'])
  })

  it('respects robots.txt', async () => {
    const run = await runJob(job({ urls: [`${shop}/private/x`] }), loader)
    expect(run.errors).toEqual([
      { url: `${shop}/private/x`, message: `${new URL(shop).host}/robots.txt doesn't allow reading /private/x.` },
    ])
  })

  it('rejects with the abort reason when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(runJob(job({}), loader, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe.skipIf(!chrome)('runJob with WRAITH, rendered pages', { timeout: 60_000 }, () => {
  const rendered = (url: string, render: Job['render'], extract: Job['extract']) =>
    runJob(job({ urls: [`${shop}${url}`], render, extract }), loader)

  it("reads content the page's scripts build", async () => {
    const run = await rendered('/app', { waitFor: 'h1' }, { fields: { title: 'h1' } })
    expect(run.records[0]?.data).toEqual({ title: 'Built by a script' })
  })

  it('clicks "Load more" until it goes away, capturing the JSON it fetches', async () => {
    const run = await rendered(
      '/more',
      { actions: [{ type: 'click', selector: '.more', times: 10 }], capture: '*/api/more/*' },
      { fields: { items: { selector: 'li', list: true } } },
    )
    expect(run.records[0]?.data).toEqual({ items: ['1', '2', '11', '12', '21', '22'] })

    const json = await rendered(
      '/more',
      { actions: [{ type: 'click', selector: '.more', times: 10 }], capture: '*/api/more/*' },
      { from: 'json', each: 'items' },
    )
    expect(json.records.map(({ data }) => data)).toEqual([{ value: 11 }, { value: 12 }, { value: 21 }, { value: 22 }])
  })

  it('types into a search box and presses Enter, following the navigation', async () => {
    const run = await rendered(
      '/search',
      {
        actions: [
          { type: 'type', selector: 'input[name=q]', text: 'rail' },
          { type: 'press', key: 'Enter' },
        ],
        waitFor: 'h1',
      },
      { fields: { title: 'h1' } },
    )
    expect(run.records[0]).toEqual({ url: `${shop}/results?q=rail`, data: { title: 'Results for rail' } })
  })

  it('scrolls to load more', async () => {
    const run = await rendered(
      '/feed',
      { actions: [{ type: 'scroll', times: 10 }] },
      { fields: { rows: { selector: '.row', list: true } } },
    )
    expect((run.records[0]?.data.rows as string[]).length).toBe(30)
  })

  it('says which action found nothing', async () => {
    const run = await rendered(
      '/app',
      { actions: [{ type: 'click', selector: '#missing' }] },
      { fields: { title: 'h1' } },
    )
    expect(run.errors).toEqual([{ url: `${shop}/app`, message: 'Action 1: nothing matched #missing to click.' }])
  })

  it("stops a page's own scripts from reaching IRCTC", async () => {
    const run = await rendered(
      '/phones-home',
      { waitFor: '#result:not(:empty)', actions: [{ type: 'wait', ms: 500 }] },
      { fields: { result: '#result' } },
    )
    expect(run.records[0]?.data).toEqual({ result: 'blocked' })
  })
})

describe('createScrapingEngine', () => {
  const engine = createScrapingEngine({ executablePath: chrome ?? '', minDelayMs: 10 })
  afterAll(() => engine.close())
  const signal = new AbortController().signal

  it('previews the first start page only', async () => {
    const preview = await engine.preview(
      {
        name: 'Shop',
        urls: [`${shop}/list?page=1`, `${shop}/list?page=2`],
        steps: [{ type: 'paginate', next: 'a.next', maxPages: 5 }],
        extract: { each: 'article', fields: { name: 'a' } },
      },
      signal,
    )
    expect(preview).toEqual({
      url: `${shop}/list?page=1`,
      total: 2,
      records: [
        { url: `${shop}/list?page=1`, data: { name: 'One' } },
        { url: `${shop}/list?page=1`, data: { name: 'Two' } },
      ],
      errors: [],
    })
  })

  it('refuses jobs that are not valid with a 400', async () => {
    await expect(
      engine.run({ name: 'Bad', urls: ['https://www.irctc.co.in/'], extract: { fields: { a: 'a' } } }, signal),
    ).rejects.toMatchObject({
      status: 400,
      message: "RailBook doesn't scrape www.irctc.co.in.",
    })
  })
})
