import { mkdtemp, readFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ApiError } from './apiError'
import { claimInstance, focusRunningInstance, releaseInstance } from './instance'
import type { HumanLevel } from '../src/automation/human'
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
  let human: HumanLevel = 'natural'
  const server = await startServer({
    ui: embeddedUi({ '/index.html': base64('<h1>RailBook</h1>'), '/assets/app-1a2b.js': base64('console.log(1)') }),
    store: {
      get: (key) => values.get(key) ?? null,
      set: async (key, value) => {
        values.set(key, value)
      },
      clear: async () => values.clear(),
    },
    scrape: {
      preview: async (job) => ({ previewed: job }),
      run: async (job) => ({ ran: job }),
    },
    human: {
      get: () => human,
      set: async (level) => {
        human = level
      },
    },
    openExternal: async (url) => {
      opened.push(url)
    },
    appInfo: { version: '1.2.3', dataDirectory: '/home/me/.config/RailBook', browser: '/usr/bin/google-chrome' },
    openDataFolder: async () => {
      opened.push('data folder')
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

  it('passes scraping jobs to the engine', async () => {
    const { api } = await setup()
    const job = { name: 'Deals', urls: ['https://shop.example/'] }

    expect(await (await api('scrape/preview', { job })).json()).toEqual({ previewed: job })
    expect(await (await api('scrape/run', { job })).json()).toEqual({ ran: job })
  })

  it("answers with the engine's own status for a job that isn't valid", async () => {
    const { api } = await setup({
      scrape: {
        preview: async () => ({}),
        run: async () => {
          throw new ApiError(400, 'The name needs a value.')
        },
      },
    })
    const response = await api('scrape/run', { job: {} })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'The name needs a value.' })
  })

  it('reports a site that fails as 502', async () => {
    const { api } = await setup({
      scrape: {
        preview: async () => {
          throw new Error("Couldn't read example.invalid. getaddrinfo ENOTFOUND example.invalid")
        },
        run: async () => ({}),
      },
    })
    const response = await api('scrape/preview', { job: {} })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: "Couldn't read example.invalid. getaddrinfo ENOTFOUND example.invalid",
    })
  })

  it('stops a run when the app stops waiting for it', async () => {
    let stopped: () => void = () => undefined
    const wasStopped = new Promise<void>((resolve) => {
      stopped = resolve
    })
    const { api } = await setup({
      scrape: {
        preview: async () => ({}),
        run: (_job, signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              stopped()
              reject(signal.reason)
            })
          }),
      },
    })

    const controller = new AbortController()
    const call = api('scrape/run', { job: {} }, { signal: controller.signal }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()
    await call
    await wasStopped
  })

  it('serves the companion site only when one is configured', async () => {
    const { api } = await setup()
    expect((await api('site/info', {})).status).toBe(404)

    const calls: unknown[] = []
    const configured = await setup({
      site: {
        info: async () => ({
          configuredUrl: 'https://example.com/',
          url: 'https://example.com/',
          title: 'Example',
          headless: true,
        }),
        extract: async (schema) => {
          calls.push(['extract', schema])
          return { title: 'Example' }
        },
        open: async (url) => {
          calls.push(['open', url])
          return { url }
        },
        act: async (options) => {
          calls.push(['act', options])
          return {}
        },
      },
    })
    expect(await (await configured.api('site/info', {})).json()).toMatchObject({ title: 'Example' })
    await configured.api('site/extract', { schema: { title: 'h1' } })
    await configured.api('site/open', { url: 'https://example.com/next' })
    await configured.api('site/act', { actions: [{ type: 'scroll', times: 2 }] })
    expect(calls).toEqual([
      ['extract', { title: 'h1' }],
      ['open', 'https://example.com/next'],
      ['act', { actions: [{ type: 'scroll', times: 2 }] }],
    ])
  })

  it('serves the scraping browser switch only under npm run dev', async () => {
    const { api } = await setup()
    expect((await api('dev/scraping-browser', {})).status).toBe(404)

    let headless = true
    const dev = await setup({
      dev: {
        isHeadless: () => headless,
        setHeadless: async (next) => {
          headless = next
        },
      },
    })
    expect(await (await dev.api('dev/scraping-browser', {})).json()).toEqual({ headless: true })
    expect(await (await dev.api('dev/scraping-browser/set', { headless: false })).json()).toEqual({ headless: false })
    expect((await dev.api('dev/scraping-browser/set', { headless: 'no' })).status).toBe(400)
    expect(headless).toBe(false)
  })

  it('changes how human scraping input looks, but never turns it off', async () => {
    const { api } = await setup()
    expect(await (await api('scraping/human', {})).json()).toEqual({ human: 'natural' })
    expect(await (await api('scraping/human/set', { human: 'careful' })).json()).toEqual({ human: 'careful' })
    for (const human of ['off', false, 'robotic', undefined]) {
      expect((await api('scraping/human/set', { human })).status).toBe(400)
    }
    expect(await (await api('scraping/human', {})).json()).toEqual({ human: 'careful' })
  })

  it('opens web addresses, IRCTC included, in the default browser', async () => {
    const { api, opened } = await setup()

    await api('open', { url: 'https://www.irctc.co.in/nget/train-search' })
    expect((await api('open', { url: 'file:///etc/passwd' })).status).toBe(400)
    expect((await api('open', { url: 'javascript:alert(1)' })).status).toBe(400)
    expect(opened).toEqual(['https://www.irctc.co.in/nget/train-search'])
  })

  it('describes the app and shows its data folder', async () => {
    const { api, opened } = await setup()

    expect(await (await api('app-info', {})).json()).toEqual({
      version: '1.2.3',
      dataDirectory: '/home/me/.config/RailBook',
      browser: '/usr/bin/google-chrome',
    })
    await api('open-data-folder', {})
    expect(opened).toEqual(['data folder'])
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
