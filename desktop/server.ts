import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ApiError } from './apiError'
import type { FileStore } from './store'
import type { UiHandler } from './ui'

// Store values hold whole collections, such as a job's saved records, so allow large bodies.
const MAX_BODY_BYTES = 20 * 1024 * 1024

export interface ServerOptions {
  ui: UiHandler
  store: FileStore
  /** Runs scraping jobs, which arrive as JSON. Throws ApiError for a job that isn't valid. */
  scrape: {
    preview(job: unknown, signal: AbortSignal): Promise<object>
    run(job: unknown, signal: AbortSignal): Promise<object>
  }
  openExternal: (url: string) => Promise<void>
  /** Shown in Settings. */
  appInfo: { version: string; dataDirectory: string; browser: string }
  /** Only under npm run dev: lets Settings show or hide the scraping browser. Its API doesn't exist otherwise. */
  dev?: {
    isHeadless(): boolean
    setHeadless(headless: boolean): Promise<void>
  }
  openDataFolder: () => Promise<void>
  /** Lets a second launch ask this one to bring its window forward, through the instance file. */
  instanceSecret: string
  focus: () => Promise<void>
}

export interface AppServer {
  origin: string
  /** Works once: opening it gives the app window its session cookie. */
  launchUrl: string
  close(): Promise<void>
}

function sameSecret(given: unknown, expected: string) {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookie(request: IncomingMessage, name: string) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=')
  }
  return undefined
}

function send(response: ServerResponse, status: number, body: object | string) {
  const json = typeof body !== 'string'
  response.writeHead(status, {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(json ? JSON.stringify(body) : body)
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'The request is too large.')
    chunks.push(chunk)
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) return body
  } catch {
    // Reported below.
  }
  throw new ApiError(400, 'The request body must be a JSON object.')
}

function text(value: unknown, name: string) {
  if (typeof value !== 'string') throw new ApiError(400, `${name} must be text.`)
  return value
}

function webAddress(value: unknown) {
  let url: URL
  try {
    url = new URL(text(value, 'url'))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, `Not a web address: ${String(value)}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new ApiError(400, 'Only http and https addresses work.')
  return url
}

function devApi(dev: NonNullable<ServerOptions['dev']>) {
  return {
    'dev/scraping-browser': async () => ({ headless: dev.isHeadless() }),
    'dev/scraping-browser/set': async (body: Record<string, unknown>) => {
      if (typeof body.headless !== 'boolean') throw new ApiError(400, 'headless must be true or false.')
      await dev.setHeadless(body.headless)
      return { headless: dev.isHeadless() }
    },
  }
}

export async function startServer(options: ServerOptions): Promise<AppServer> {
  const token = randomBytes(32).toString('base64url')
  let launched = false
  let host = ''
  let cookieName = ''

  const api: Record<string, (body: Record<string, unknown>, signal: AbortSignal) => Promise<object>> = {
    'store/get': async (body) => ({ value: options.store.get(text(body.key, 'key')) }),
    'store/set': async (body) => {
      await options.store.set(text(body.key, 'key'), text(body.value, 'value'))
      return {}
    },
    'store/clear': async () => {
      await options.store.clear()
      return {}
    },
    'scrape/preview': (body, signal) => options.scrape.preview(body.job, signal),
    'scrape/run': (body, signal) => options.scrape.run(body.job, signal),
    open: async (body) => {
      await options.openExternal(webAddress(body.url).href)
      return {}
    },
    'app-info': async () => options.appInfo,
    ...(options.dev && devApi(options.dev)),
    'open-data-folder': async () => {
      await options.openDataFolder()
      return {}
    },
  }

  async function handleApi(name: string, request: IncomingMessage, response: ServerResponse) {
    const handler = api[name]
    if (!handler) throw new ApiError(404, `No such API: ${name}`)
    if (request.method !== 'POST') throw new ApiError(405, 'Use POST.')
    // Other sites can't send JSON here without a CORS preflight, which this server never approves.
    if (!request.headers['content-type']?.startsWith('application/json')) {
      throw new ApiError(415, 'Send JSON with Content-Type: application/json.')
    }
    const controller = new AbortController()
    response.on('close', () => {
      if (!response.writableFinished) controller.abort()
    })
    const body = await readJson(request)
    try {
      send(response, 200, await handler(body, controller.signal))
    } catch (error) {
      if (error instanceof ApiError) throw error
      // Anything else is the site or the browser failing, not this request being wrong.
      throw new ApiError(502, error instanceof Error ? error.message : String(error))
    }
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    // Only the exact address works, which stops pages that rebind their own host name to 127.0.0.1.
    if (request.headers.host !== host) return send(response, 403, 'Forbidden.')
    const url = new URL(request.url ?? '/', `http://${host}`)

    if (url.pathname === '/launch') {
      if (launched || !sameSecret(url.searchParams.get('token'), token)) {
        return send(response, 403, 'This link has been used. Open RailBook from its launcher.')
      }
      launched = true
      response.writeHead(302, {
        'Set-Cookie': `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`,
        Location: '/',
      })
      return response.end()
    }

    if (url.pathname === '/instance/focus' && request.method === 'POST') {
      if (!sameSecret(request.headers['x-railbook-instance'], options.instanceSecret)) {
        return send(response, 403, 'Forbidden.')
      }
      await options.focus()
      return send(response, 200, {})
    }

    if (!sameSecret(cookie(request, cookieName), token)) return send(response, 403, 'Open RailBook from its launcher.')
    if (url.pathname.startsWith('/api/')) return handleApi(url.pathname.slice('/api/'.length), request, response)
    options.ui(request, response, () => send(response, 404, 'Not found.'))
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (response.headersSent) return response.destroy()
      const status = error instanceof ApiError ? error.status : 500
      send(response, status, { error: error instanceof Error ? error.message : String(error) })
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address() as AddressInfo
  host = `127.0.0.1:${port}`
  // Cookies ignore ports, so name this launch's cookie after its own port.
  cookieName = `railbook_${port}`
  const origin = `http://${host}`

  return {
    origin,
    launchUrl: `${origin}/launch?token=${token}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      }),
  }
}
