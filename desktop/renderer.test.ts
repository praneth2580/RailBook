import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findChrome } from './chrome'
import { fetchPage } from './pages'
import { createRenderer } from './renderer'

// A local site whose pages build their content with JavaScript.
const PAGES: Record<string, string> = {
  '/': `<ul id="list"></ul><script>setTimeout(() => { list.innerHTML = '<li class="item">Built by a script</li>' }, 200)</script>`,
  '/late': `<p>Loading</p><script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<p class="late">Ready</p>'), 1500)</script>`,
  '/with-image': `<img src="/image.png"><p>Text</p>`,
}

let site: Server
let origin = ''
let closedOrigin = ''
let imageRequests = 0

/** An address nothing listens on. Port 1 won't do: browsers and fetch refuse it as unsafe before connecting. */
async function closedAddress() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise((resolve) => server.close(resolve))
  return `http://127.0.0.1:${port}/`
}

beforeAll(async () => {
  site = createServer((request, response) => {
    const url = request.url ?? '/'
    if (url === '/image.png') imageRequests += 1
    if (url === '/redirect') return response.writeHead(302, { Location: '/' }).end()
    if (url === '/missing') return response.writeHead(404, { 'Content-Type': 'text/html' }).end('<p>Gone</p>')
    if (url === '/hang') return
    if (url === '/agent') return response.end(`<p id="agent">${request.headers['user-agent']}</p>`)
    response.writeHead(200, { 'Content-Type': 'text/html', 'X-Site': 'test' }).end(PAGES[url] ?? '')
  })
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(site.address() as AddressInfo).port}`
  closedOrigin = await closedAddress()
})

afterAll(async () => {
  site.closeAllConnections()
  await new Promise((resolve) => site.close(resolve))
})

const request = (pathname: string, extra: { timeoutMs?: number; waitFor?: string } = {}) => ({
  url: `${origin}${pathname}`,
  headers: { 'User-Agent': 'RailBook/0.1' },
  timeoutMs: 10_000,
  ...extra,
})
const neverStop = new AbortController().signal

describe('fetchPage', () => {
  it('fetches with the given headers and follows redirects', async () => {
    const page = await fetchPage(request('/redirect'), neverStop)
    expect(page.url).toBe(`${origin}/`)
    expect(page.headers['x-site']).toBe('test')
    expect((await fetchPage(request('/agent'), neverStop)).body).toBe('<p id="agent">RailBook/0.1</p>')
  })

  it('reports why a site is unreachable', async () => {
    await expect(fetchPage({ ...request('/'), url: closedOrigin }, neverStop)).rejects.toThrow('ECONNREFUSED')
  })

  it('gives up after the timeout', async () => {
    await expect(fetchPage(request('/hang', { timeoutMs: 1000 }), neverStop)).rejects.toThrow('No answer within 1s.')
  })
})

const chrome = findChrome()

describe.skipIf(!chrome)('createRenderer', { timeout: 30_000 }, () => {
  const renderer = createRenderer(chrome ?? '')
  afterAll(() => renderer.close())

  it("reads content that the page's scripts build", async () => {
    const page = await renderer.render(request('/'), neverStop)
    expect(page.body).toContain('<li class="item">Built by a script</li>')
    expect(page.status).toBe(200)
    expect(page.headers['x-site']).toBe('test')
  })

  it('waits for a selector', async () => {
    expect((await renderer.render(request('/late', { waitFor: '.late' }), neverStop)).body).toContain('Ready')
  })

  it('fails clearly when the selector never matches', async () => {
    await expect(renderer.render(request('/', { waitFor: '.never', timeoutMs: 2000 }), neverStop)).rejects.toThrow(
      'Nothing matched .never within 2s.',
    )
  })

  it('follows redirects and reports the status', async () => {
    expect((await renderer.render(request('/redirect'), neverStop)).url).toBe(`${origin}/`)
    expect((await renderer.render(request('/missing'), neverStop)).status).toBe(404)
  })

  it('names RailBook after the browser in the User-Agent', async () => {
    const { body } = await renderer.render(request('/agent'), neverStop)
    expect(body).toMatch(/<p id="agent">Mozilla\/5\.0 .+ RailBook\/0\.1<\/p>/)
  })

  it('skips downloading images', async () => {
    imageRequests = 0
    expect((await renderer.render(request('/with-image'), neverStop)).body).toContain('Text')
    expect(imageRequests).toBe(0)
  })

  it('explains pages that fail to load', async () => {
    await expect(renderer.render({ ...request('/'), url: closedOrigin }, neverStop)).rejects.toThrow(
      "The page didn't load (net::ERR_CONNECTION_REFUSED).",
    )
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    const rendering = renderer.render(request('/', { waitFor: '.never' }), controller.signal)
    setTimeout(() => controller.abort(), 1000)
    await expect(rendering).rejects.toMatchObject({ name: 'AbortError' })
  })
})
