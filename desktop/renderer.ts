import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchChrome, waitForChrome, type Chrome } from './chrome'
import type { PageRequest, PageResponse } from './pages'

/** Extra time a page gets after it loads for its scripts' requests to finish. */
const SETTLE_MS = 3000
const POLL_MS = 50

interface Browser {
  chrome: Chrome
  userAgent: string
  profile: string
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Polls until check passes. Rejects with timeoutMessage at the deadline, or with the abort reason. */
async function waitUntil(check: () => boolean | Promise<boolean>, deadline: number, signal: AbortSignal, timeoutMessage: string) {
  while (!(await check())) {
    signal.throwIfAborted()
    if (Date.now() >= deadline) throw new Error(timeoutMessage)
    await delay(POLL_MS)
  }
}

/** Renders pages in a headless browser that starts on first use and is shared after that. */
export function createRenderer(executable: string) {
  let browser: Promise<Browser> | null = null

  async function start(): Promise<Browser> {
    const profile = await mkdtemp(path.join(tmpdir(), 'railbook-render-'))
    const chrome = launchChrome(executable, [
      '--headless',
      `--user-data-dir=${profile}`,
      '--mute-audio',
      '--hide-scrollbars',
      'about:blank',
    ])
    void chrome.exited.then(async () => {
      browser = null
      await rm(profile, { recursive: true, force: true })
    })
    try {
      const { userAgent } = await waitForChrome(chrome)
      await chrome.cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' })
      return { chrome, userAgent, profile }
    } catch (error) {
      chrome.kill()
      throw error
    }
  }

  async function render({ url, headers, timeoutMs, waitFor }: PageRequest, signal: AbortSignal): Promise<PageResponse> {
    const deadline = Date.now() + timeoutMs
    const { chrome, userAgent } = await (browser ??= start().catch((error) => {
      browser = null
      throw error
    }))
    const { cdp } = chrome
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const stopListening: (() => void)[] = []
    try {
      const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
      const send = <T = any>(method: string, params?: object) => cdp.send<T>(method, params, sessionId)
      const { frameTree } = await send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree')
      const frameId = frameTree.frame.id

      const lifecycle = new Set<string>()
      // The last response for the page itself, after any redirects.
      const main: { status?: number; headers?: Record<string, string> } = {}
      stopListening.push(
        cdp.on('Page.lifecycleEvent', (params, from) => {
          if (from === sessionId && params.frameId === frameId) lifecycle.add(`${params.loaderId}:${params.name}`)
        }),
        cdp.on('Network.responseReceived', (params, from) => {
          if (from !== sessionId || params.type !== 'Document' || params.frameId !== frameId) return
          main.status = params.response.status
          main.headers = Object.fromEntries(
            Object.entries(params.response.headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
          )
        }),
        // Images, fonts and media don't change the HTML, so skip downloading them.
        cdp.on('Fetch.requestPaused', (params, from) => {
          if (from !== sessionId) return
          void send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }).catch(() => undefined)
        }),
      )

      await send('Page.enable')
      await send('Page.setLifecycleEventsEnabled', { enabled: true })
      await send('Network.enable')
      await send('Fetch.enable', { patterns: ['Image', 'Font', 'Media'].map((resourceType) => ({ resourceType })) })
      // Say who is asking, after the browser's own name.
      const ownName = headers['User-Agent']
      if (ownName) await send('Network.setUserAgentOverride', { userAgent: `${userAgent} ${ownName}` })

      signal.throwIfAborted()
      const navigation = await send<{ loaderId?: string; errorText?: string }>('Page.navigate', { url })
      if (navigation.errorText) throw new Error(`The page didn't load (${navigation.errorText}).`)
      const loaded = (name: string) => () => lifecycle.has(`${navigation.loaderId}:${name}`)

      await waitUntil(loaded('load'), deadline, signal, `The page didn't finish loading within ${timeoutMs / 1000}s.`)
      // Pages that keep a connection open never go idle, so this wait is best effort.
      await waitUntil(loaded('networkIdle'), Math.min(deadline, Date.now() + SETTLE_MS), signal, '').catch(() => {
        signal.throwIfAborted()
      })
      if (waitFor) {
        const expression = `document.querySelector(${JSON.stringify(waitFor)}) !== null`
        await waitUntil(
          async () => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value === true,
          deadline,
          signal,
          `Nothing matched ${waitFor} within ${timeoutMs / 1000}s.`,
        )
      }

      const { result } = await send('Runtime.evaluate', {
        expression: '[location.href, document.documentElement.outerHTML]',
        returnByValue: true,
      })
      const [finalUrl, body] = result.value as [string, string]
      return { url: finalUrl, status: main.status ?? 200, headers: main.headers ?? {}, body }
    } finally {
      for (const stop of stopListening) stop()
      await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined)
    }
  }

  async function close() {
    const running = await browser?.catch(() => null)
    if (!running) return
    await running.chrome.cdp.send('Browser.close').catch(() => running.chrome.kill())
    await running.chrome.exited
  }

  return { render, close }
}
