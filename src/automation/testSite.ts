// Test helpers: a scripted website and a clock that only moves when the scraper waits.
import type { HttpClient } from './http'
import { createScraper, type ScraperOptions } from './scraper'

type Reply = string | Error | { status?: number; body?: string; headers?: Record<string, string>; url?: string }

/** Routes not listed answer 404. A list of replies is used in order, and its last reply repeats. */
export function testScraper(routes: Record<string, Reply | Reply[]>, options: ScraperOptions = {}) {
  const requests: string[] = []
  const rendered: { url: string; waitFor?: string; timeoutMs: number }[] = []
  const waits: number[] = []
  let time = 0

  const http: HttpClient = {
    async get({ url, signal, render, timeoutMs }) {
      signal?.throwIfAborted()
      requests.push(url)
      if (render) rendered.push({ url, waitFor: render.waitFor, timeoutMs })
      const route = routes[url]
      const reply = Array.isArray(route) ? (route.length > 1 ? route.shift() : route[0]) : route
      if (reply === undefined) return { url, status: 404, headers: {}, body: '' }
      if (reply instanceof Error) throw reply
      if (typeof reply === 'string') return { url, status: 200, headers: {}, body: reply }
      return { url: reply.url ?? url, status: reply.status ?? 200, headers: reply.headers ?? {}, body: reply.body ?? '' }
    },
  }

  const scraper = createScraper({
    http,
    now: () => time,
    sleep: async (ms) => {
      waits.push(ms)
      time += ms
    },
    ...options,
  })
  return { scraper, requests, rendered, waits }
}
