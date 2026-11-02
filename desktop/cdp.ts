import type { Readable, Writable } from 'node:stream'

// Chrome DevTools Protocol over --remote-debugging-pipe: JSON messages, each ended by a NUL byte.
// A pipe rather than a port means no other program on the computer can connect to the browser.

type Listener = (params: any, sessionId: string | undefined) => void

export interface Cdp {
  send<T = any>(method: string, params?: object, sessionId?: string): Promise<T>
  /** Returns a function that removes the listener. */
  on(method: string, listener: Listener): () => void
  /** Settles when the pipe closes, which is when Chrome exits. */
  readonly closed: Promise<void>
}

export function connectCdp(input: Writable, output: Readable): Cdp {
  let nextId = 1
  let buffer = ''
  let isClosed = false
  const pending = new Map<number, { method: string; resolve: (result: any) => void; reject: (error: Error) => void }>()
  const listeners = new Map<string, Set<Listener>>()

  const closed = new Promise<void>((resolve) => {
    const close = () => {
      if (isClosed) return
      isClosed = true
      for (const { method, reject } of pending.values()) reject(new Error(`Chrome closed before answering ${method}.`))
      pending.clear()
      resolve()
    }
    output.on('end', close)
    output.on('close', close)
    output.on('error', close)
  })
  // Writes fail once Chrome has gone, and that already shows up as closed.
  input.on('error', () => undefined)

  output.setEncoding('utf8')
  output.on('data', (chunk: string) => {
    buffer += chunk
    for (let end = buffer.indexOf('\0'); end >= 0; end = buffer.indexOf('\0')) {
      const message = JSON.parse(buffer.slice(0, end))
      buffer = buffer.slice(end + 1)
      if (typeof message.id === 'number') {
        const call = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) call?.reject(new Error(`${call.method}: ${message.error.message}`))
        else call?.resolve(message.result)
      } else {
        for (const listener of listeners.get(message.method) ?? []) listener(message.params, message.sessionId)
      }
    }
  })

  return {
    send(method, params = {}, sessionId) {
      if (isClosed) return Promise.reject(new Error(`Chrome has closed, so ${method} can't be sent.`))
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { method, resolve, reject })
        input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`)
      })
    },
    on(method, listener) {
      const set = listeners.get(method) ?? new Set()
      set.add(listener)
      listeners.set(method, set)
      return () => set.delete(listener)
    },
    closed,
  }
}
