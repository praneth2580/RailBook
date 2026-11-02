import { mkdtemp, readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claimInstance, focusRunningInstance, releaseInstance } from './instance'
import type { PageRequest } from './pages'
import { startServer, type AppServer, type ServerOptions } from './server'
import { embeddedUi } from './ui'

const servers: AppServer[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

const base64 = (text: string) => Buffer.from(text).toString('base64')

async function setup(overrides: Partial<ServerOptions> = {}) {
  const values = new Map<string, string>()
  const opened: string[] = []
  let focused = 0
  const server = await startServer({
    ui: embeddedUi({ '/index.html': base64('<h1>RailBook</h1>'), '/assets/app-1a2b.js': base64('console.log(1)') }),
    store: {
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value)
      },
      clear: async () => values.clear(),
    },
    fetchPage: async ({ url }: PageRequest) => ({ url, status: 200, headers: {}, body: `fetched ${url}` }),
    render: async ({ url, waitFor }: PageRequest) => ({ url, status: 200, headers: {}, body: `rendered after ${waitFor}` }),
    openExternal: async (url) => {
      opened.push(url)
    },
    instanceSecret: 'instance-secret',
    focus: async () => {
      focused += 1
    },
    ...overrides,
  })
  servers.push(server)

  // Opens the launch link the way the app window does, and keeps the cookie.
  const launch = await fetch(server.launchUrl, { redirect: 'manual' })
  const cookie = launch.headers.get('set-cookie')?.split(';')[0] ?? ''
  const get = (pathname: string, headers: Record<string, string> = { Cookie: cookie }) =>
    fetch(`${server.origin}${pathname}`, { headers })
  const api = (name: string, body: object, init: { headers?: Record<string, string>; signal?: AbortSignal } = {}) =>
    fetch(`${server.origin}/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, ...init.headers },
      body: JSON.stringify(body),
      signal: init.signal,
    })
  return { server, launch, get, api, opened, focused: () => focused }
}

/** fetch won't send a different Host header, so use node:http for that. */
function requestWithHost(origin: string, host: string, cookie: string) {
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest(`${origin}/`, { headers: { Host: host, Cookie: cookie } }, (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    request.on('error', reject)
    request.end()
  })
}

describe('startServer', () => {
  it('gives the app window a session cookie through a link that works once', async () => {
    const { server, launch } = await setup()

    expect(launch.status).toBe(302)
    expect(launch.headers.get('location')).toBe('/')
    expect(launch.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Strict; Path=\//)
    expect((await fetch(server.launchUrl, { redirect: 'manual' })).status).toBe(403)
  })

  it('serves the UI only with the cookie', async () => {
    const { get } = await setup()

    expect((await get('/', {})).status).toBe(403)
    const page = await get('/')
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await page.text()).toBe('<h1>RailBook</h1>')
  })

  it("answers the app's own routes with index.html", async () => {
    const { get } = await setup()
    expect(await (await get('/tasks/123/run')).text()).toBe('<h1>RailBook</h1>')
    expect((await get('/missing.png')).status).toBe(404)
  })

  it('serves hashed assets with a long cache life', async () => {
    const response = await (await setup()).get('/assets/app-1a2b.js')
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(response.headers.get('cache-control')).toContain('immutable')
  })

  it('refuses requests addressed to any other host name', async () => {
    const { server, launch } = await setup()
    const cookie = launch.headers.get('set-cookie')?.split(';')[0] ?? ''
    const port = new URL(server.origin).port

    expect(await requestWithHost(server.origin, `127.0.0.1:${port}`, cookie)).toBe(200)
    expect(await requestWithHost(server.origin, `attacker.example:${port}`, cookie)).toBe(403)
    expect(await requestWithHost(server.origin, `localhost:${port}`, cookie)).toBe(403)
  })

  it('only takes JSON POSTs with the cookie on the API', async () => {
    const { api, get } = await setup()

    expect((await api('store/get', { key: 'a' }, { headers: { Cookie: '' } })).status).toBe(403)
    expect((await api('store/get', { key: 'a' }, { headers: { 'Content-Type': 'text/plain' } })).status).toBe(415)
    expect((await get('/api/store/get')).status).toBe(405)
    expect(await (await api('nothing', {})).json()).toEqual({ error: 'No such API: nothing' })
  })

  it('stores values', async () => {
    const { api } = await setup()

    await api('store/set', { key: 'settings', value: '{"theme":"dark"}' })
    expect(await (await api('store/get', { key: 'settings' })).json()).toEqual({ value: '{"theme":"dark"}' })
    await api('store/clear', {})
    expect(await (await api('store/get', { key: 'settings' })).json()).toEqual({ value: null })
    expect((await api('store/set', { key: 'settings', value: 5 })).status).toBe(400)
  })

  it('fetches and renders pages', async () => {
    const { api } = await setup()
    const request = { url: 'https://example.com/a', headers: { 'User-Agent': 'RailBook/0.1' }, timeoutMs: 5000 }

    expect(await (await api('fetch', request)).json()).toMatchObject({ status: 200, body: 'fetched https://example.com/a' })
    expect(await (await api('render', { ...request, waitFor: '.item' })).json()).toMatchObject({
      body: 'rendered after .item',
    })
  })

  it('checks page requests', async () => {
    const { api } = await setup()

    expect(await (await api('fetch', { url: 'ftp://example.com/' })).json()).toEqual({
      error: 'Only http and https addresses work.',
    })
    expect((await api('fetch', { url: 'https://example.com/', headers: { Accept: 1 } })).status).toBe(400)
  })

  it('never fetches IRCTC, even after a redirect', async () => {
    const { api } = await setup({
      fetchPage: async () => ({ url: 'https://www.irctc.co.in/nget/train-search', status: 200, headers: {}, body: '' }),
    })

    const direct = await api('render', { url: 'https://irctc.co.in/' })
    expect(direct.status).toBe(403)
    expect(await direct.json()).toEqual({ error: "RailBook doesn't scrape irctc.co.in." })
    expect(await (await api('fetch', { url: 'https://short.example/x' })).json()).toEqual({
      error: "RailBook doesn't scrape www.irctc.co.in.",
    })
  })

  it('reports a site that fails as 502', async () => {
    const { api } = await setup({
      fetchPage: async () => {
        throw new Error('getaddrinfo ENOTFOUND example.invalid')
      },
    })
    const response = await api('fetch', { url: 'https://example.invalid/' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'getaddrinfo ENOTFOUND example.invalid' })
  })

  it('stops loading a page when the app stops waiting for it', async () => {
    let stopped: () => void = () => undefined
    const wasStopped = new Promise<void>((resolve) => {
      stopped = resolve
    })
    const { api } = await setup({
      fetchPage: (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            stopped()
            reject(signal.reason)
          })
        }),
    })

    const controller = new AbortController()
    const call = api('fetch', { url: 'https://example.com/slow' }, { signal: controller.signal }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()
    await call
    await wasStopped
  })

  it('opens web addresses, IRCTC included, in the default browser', async () => {
    const { api, opened } = await setup()

    await api('open', { url: 'https://www.irctc.co.in/nget/train-search' })
    expect((await api('open', { url: 'file:///etc/passwd' })).status).toBe(400)
    expect((await api('open', { url: 'javascript:alert(1)' })).status).toBe(400)
    expect(opened).toEqual(['https://www.irctc.co.in/nget/train-search'])
  })
})

describe('single instance', () => {
  it('lets a second launch bring the open window forward', async () => {
    const { server, focused } = await setup()
    const file = path.join(await mkdtemp(path.join(tmpdir(), 'railbook-instance-')), 'instance.json')

    expect(await focusRunningInstance(file)).toBe(false)
    await claimInstance(file, { origin: server.origin, secret: 'instance-secret' })
    expect(await focusRunningInstance(file)).toBe(true)
    expect(focused()).toBe(1)

    await claimInstance(file, { origin: server.origin, secret: 'wrong' })
    expect(await focusRunningInstance(file)).toBe(false)
  })

  it('treats a file left by a closed RailBook as stale', async () => {
    const { server } = await setup()
    const file = path.join(await mkdtemp(path.join(tmpdir(), 'railbook-instance-')), 'instance.json')
    await claimInstance(file, { origin: server.origin, secret: 'instance-secret' })
    await server.close()

    expect(await focusRunningInstance(file)).toBe(false)
  })

  it("only removes the file when it's still this launch's", async () => {
    const file = path.join(await mkdtemp(path.join(tmpdir(), 'railbook-instance-')), 'instance.json')
    await claimInstance(file, { origin: 'http://127.0.0.1:1', secret: 'newer' })

    await releaseInstance(file, 'older')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ origin: 'http://127.0.0.1:1', secret: 'newer' })
    await releaseInstance(file, 'newer')
    await expect(readFile(file)).rejects.toThrow()
  })
})
