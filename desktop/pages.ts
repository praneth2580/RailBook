export interface PageRequest {
  url: string
  headers: Record<string, string>
  timeoutMs: number
  /** Rendering only: wait until this CSS selector matches. */
  waitFor?: string
}

export interface PageResponse {
  /** Final address after redirects. */
  url: string
  status: number
  /** Names are lower case. */
  headers: Record<string, string>
  body: string
}

export async function fetchPage({ url, headers, timeoutMs }: PageRequest, signal: AbortSignal): Promise<PageResponse> {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) })
    return {
      url: response.url,
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: await response.text(),
    }
  } catch (error) {
    if (signal.aborted) throw error
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error(`No answer within ${timeoutMs / 1000}s.`)
    }
    // fetch reports "fetch failed" and keeps the useful part, such as ENOTFOUND, in cause.
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : null
    throw new Error(cause ?? (error instanceof Error ? error.message : String(error)))
  }
}
