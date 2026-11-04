import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SiteLogEntry } from '../../src/features/site/siteLog'
import { findChrome } from '../chrome'
import { createManagedSite } from './managedSite'
import { createSiteRecorder } from './siteRecorder'

/** Enough of a browser context to hand the recorder, keeping the binding so a test can call it as a page would. */
function fakeContext() {
  let binding: ((source: unknown, value: unknown) => void) | undefined
  const context = {
    exposeBinding: async (_name: string, callback: typeof binding) => {
      binding = callback
    },
    addInitScript: async () => undefined,
    on: () => context,
  }
  return { context, send: (value: unknown) => binding?.({}, value) }
}

describe('createSiteRecorder', () => {
  it("marks what happens during RailBook's own actions as the helper's, and the rest as the person's", async () => {
    const recorder = createSiteRecorder()
    const { context, send } = fakeContext()
    await recorder.attach(context as never)
    send({ kind: 'click', url: 'https://example.com/', element: { tag: 'a', classes: [], attributes: {}, css: 'a' } })
    await recorder.asHelper(async () => send({ kind: 'press', url: 'https://example.com/', key: 'Enter' }))
    expect(recorder.since(0).map(({ id, by, kind }) => ({ id, by, kind }))).toEqual([
      { id: 1, by: 'you', kind: 'click' },
      { id: 2, by: 'helper', kind: 'press' },
    ])
    expect(recorder.since(1).map(({ id }) => id)).toEqual([2])
    recorder.clear()
    expect(recorder.since(0)).toEqual([])
  })

  it("ignores what a page's own scripts send that isn't an entry, and trims what's too long", async () => {
    const recorder = createSiteRecorder()
    const { context, send } = fakeContext()
    await recorder.attach(context as never)
    for (const junk of [null, 'click', { kind: 'steal' }, { kind: 'page', url: 'x' }]) send(junk)
    send({ kind: 'click', url: 'x'.repeat(5000), element: { tag: 'a', classes: 'not a list', text: 'y'.repeat(500) } })
    const [entry] = recorder.since(0)
    expect(recorder.since(0)).toHaveLength(1)
    expect(entry?.url).toHaveLength(2000)
    expect(entry?.element).toMatchObject({ tag: 'a', classes: [], attributes: {}, css: '' })
    expect(entry?.element?.text).toHaveLength(120)
  })
})

const PAGE = `<title>Sign in</title>
<header><a href="#" id="menuLink" aria-label="Menu"><i class="fa fa-bars">≡</i></a></header>
<input id="user" placeholder="User Name">
<input id="pass" type="password" placeholder="Password">
<a href="/next">Next page</a>`

const chrome = findChrome()

describe.skipIf(!chrome)('the companion site with record on', { timeout: 60_000 }, () => {
  let server: Server
  let origin = ''
  let site: ReturnType<typeof createManagedSite>

  beforeAll(async () => {
    server = createServer((request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(request.url === '/next' ? '<h1>Next</h1>' : PAGE)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    site = createManagedSite({ url: `${origin}/`, executablePath: chrome ?? '', human: 'fast', record: true })
  })

  afterAll(async () => {
    await site.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  it('logs clicks on the element around what was clicked, every key pressed, and pages, but not passwords', async () => {
    await site.info()
    await site.act({
      actions: [
        { type: 'click', selector: '#menuLink i' },
        { type: 'type', selector: '#user', text: 'ab' },
        { type: 'type', selector: '#pass', text: 'xy' },
        { type: 'press', key: 'Enter' },
        { type: 'click', selector: 'text=Next page' },
      ],
    })
    const { entries } = (await site.log!.since(0)) as { entries: SiteLogEntry[] }

    expect(entries.every((entry) => entry.by === 'helper')).toBe(true)
    // The menu link's href="#" moves the address too.
    expect(entries.filter((entry) => entry.kind === 'page').map((entry) => entry.url)).toEqual([
      `${origin}/`,
      `${origin}/#`,
      `${origin}/next`,
    ])
    const menu = entries.find((entry) => entry.kind === 'click')
    expect(menu?.element).toMatchObject({ tag: 'a', id: 'menuLink', attributes: { 'aria-label': 'Menu' } })
    const pressed = (id: string) =>
      entries.filter((entry) => entry.kind === 'press' && entry.element?.id === id).map((entry) => entry.key)
    expect(pressed('user')).toEqual(['a', 'b'])
    expect(pressed('pass')).toEqual(['•', '•', 'Enter'])
    // Nothing typed into the password field reaches the log in any form.
    expect(JSON.stringify(entries)).not.toMatch(/"x"|"y"|xy/)
  })

  it('keeps no log, and offers none, when record is off', () => {
    expect(createManagedSite({ url: `${origin}/`, executablePath: chrome ?? '' }).log).toBeNull()
  })
})
