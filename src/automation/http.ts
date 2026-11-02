import { callApi } from '../platform/api'

export interface RenderOptions {
  /** Wait until this CSS selector matches before reading the page. */
  waitFor?: string
}

export interface HttpRequest {
  url: string
  headers: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal
  /** Load the page in headless Chrome and read it after its JavaScript has run. */
  render?: RenderOptions
}

export interface HttpResponse {
  /** Final address after redirects. */
  url: string
  status: number
  /** Names are lower case. */
  headers: Record<string, string>
  body: string
}

export interface HttpClient {
  get(request: HttpRequest): Promise<HttpResponse>
}

// The launcher makes the request, so CORS doesn't apply and the User-Agent is sent as given.
export const defaultHttpClient: HttpClient = {
  get({ url, headers, timeoutMs, signal, render }) {
    // The launcher enforces timeoutMs itself; this only covers it not answering at all.
    const deadline = AbortSignal.timeout(timeoutMs + 5000)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    const body = { url, headers, timeoutMs, waitFor: render?.waitFor }
    return callApi<HttpResponse>(render ? 'render' : 'fetch', body, combined)
  },
}
