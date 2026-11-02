/**
 * Calls RailBook's local server, which the desktop launcher starts on 127.0.0.1. It only answers the app window,
 * which got a session cookie when the launcher opened it.
 */
export async function callApi<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error("RailBook's background process has stopped. Close this window and open RailBook again.")
  }
  const result = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(result.error ?? `RailBook's local server answered ${response.status}.`)
  return result
}
