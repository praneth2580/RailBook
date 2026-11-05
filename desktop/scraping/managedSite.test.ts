import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findChrome } from '../chrome'
import { createManagedSite } from './managedSite'

const servers: Server[] = []

async function site(routes: Record<string, string>) {
  const server = createServer((request, response) => {
    const body = routes[request.url ?? '/']
    if (body === undefined) return response.writeHead(404).end('Not found')
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(body.replaceAll('{origin}', origin))
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return origin
}

afterAll(async () => {
  for (const server of servers) server.closeAllConnections()
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
})

describe('createManagedSite guard', () => {
  it('refuses a malformed address before opening anything', () => {
    expect(() => createManagedSite({ url: 'not a url', executablePath: '' })).toThrow('Not a web address')
  })
})

const chrome = findChrome()

describe.skipIf(!chrome)('createManagedSite', { timeout: 60_000 }, () => {
  let origin = ''
  let managed: ReturnType<typeof createManagedSite>

  beforeAll(async () => {
    origin = await site({
      '/': '<title>Home</title><h1 id="title">Home</h1><p class="count">0</p><button id="more">More</button><a id="away" href="/next">Next</a><script>let n=0;more.onclick=()=>document.querySelector(".count").textContent=++n</script>',
      '/next': '<title>Next page</title><h1 id="title">Next page</h1>',
      '/remember': '<title>Remember</title><script>document.cookie="seen=1";localStorage.setItem("seen","1")</script>',
      '/stored':
        '<title>Stored</title><p id="cookie"></p><p id="local"></p><script>cookie.textContent=document.cookie||"none";local.textContent=localStorage.getItem("seen")??"none"</script>',
    })
    managed = createManagedSite({ url: `${origin}/`, executablePath: chrome ?? '', human: 'fast' })
  })

  afterAll(() => managed.close())

  it('opens the configured page and reports where it is', async () => {
    expect(await managed.info()).toEqual({
      configuredUrl: `${origin}/`,
      url: `${origin}/`,
      title: 'Home',
      headless: true,
    })
  })

  it('reads the live page with a selector schema', async () => {
    expect(await managed.extract({ title: '#title', count: '.count' })).toEqual({ title: 'Home', count: '0' })
  })

  it('acts on the page, and the next read reflects it', async () => {
    await managed.act({ actions: [{ type: 'click', selector: '#more', times: 3 }] })
    expect(await managed.extract({ count: '.count' })).toEqual({ count: '3' })
  })

  it('navigates to another address, but refuses invalid ones', async () => {
    expect(await managed.open(`${origin}/next`)).toMatchObject({ url: `${origin}/next`, title: 'Next page' })
    await expect(managed.open('ftp://example.com/')).rejects.toMatchObject({ status: 400 })
    await managed.open(`${origin}/`)
  })

  it('opens every address with no cookies or storage left from before', async () => {
    await managed.open(`${origin}/remember`)
    await managed.open(`${origin}/stored`)
    expect(await managed.extract({ cookie: '#cookie', local: '#local' })).toEqual({ cookie: 'none', local: 'none' })
    await managed.open(`${origin}/`)
  })

  it('changes how human input looks by reopening the page where it is', async () => {
    await managed.open(`${origin}/`)
    await managed.act({ actions: [{ type: 'click', selector: '#more' }] })
    expect(await managed.extract({ count: '.count' })).toEqual({ count: '1' })
    await managed.setHuman('careful')
    // A fresh tab, so the count starts again.
    expect(await managed.extract({ count: '.count' })).toEqual({ count: '0' })

    // Where the page has moved to, not the configured address.
    await managed.open(`${origin}/next`)
    await managed.setHuman('fast')
    expect(await managed.info()).toMatchObject({ url: `${origin}/next`, title: 'Next page' })
    await managed.open(`${origin}/`)
  })

  it('reports a bad selector as the caller mistake', async () => {
    await expect(managed.extract({ broken: 'div[' })).rejects.toMatchObject({ status: 400 })
  })
})
