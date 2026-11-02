import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

/** Connect-style handler, the shape Vite's dev middleware also has. */
export type UiHandler = (request: IncomingMessage, response: ServerResponse, next: () => void) => void

/** Built UI files by URL path, base64 encoded. The packaging script generates this from dist/. */
export type EmbeddedFiles = Record<string, string>

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

/** Serves the embedded build. Unknown paths get index.html so the app's own routes load on refresh. */
export function embeddedUi(files: EmbeddedFiles): UiHandler {
  const decoded = new Map(Object.entries(files).map(([file, body]) => [file, Buffer.from(body, 'base64')]))

  return (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next()
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://app').pathname)
    const file = decoded.has(pathname) ? pathname : path.posix.extname(pathname) ? null : '/index.html'
    const body = file && decoded.get(file)
    if (!file || !body) return next()

    response.setHeader('Content-Type', CONTENT_TYPES[path.posix.extname(file)] ?? 'application/octet-stream')
    // Vite puts a content hash in asset names, so only index.html can change between versions.
    response.setHeader('Cache-Control', file.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache')
    response.end(request.method === 'HEAD' ? undefined : body)
  }
}
