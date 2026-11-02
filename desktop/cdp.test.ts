import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { connectCdp } from './cdp'

function fakeChrome() {
  const toChrome = new PassThrough()
  const fromChrome = new PassThrough()
  const sent: { id: number; method: string; params: object; sessionId?: string }[] = []
  toChrome.setEncoding('utf8')
  toChrome.on('data', (chunk: string) => {
    for (const message of chunk.split('\0').filter(Boolean)) sent.push(JSON.parse(message))
  })
  const reply = (message: object) => fromChrome.write(`${JSON.stringify(message)}\0`)
  return { cdp: connectCdp(toChrome, fromChrome), sent, reply, fromChrome }
}

describe('connectCdp', () => {
  it('matches replies to calls', async () => {
    const { cdp, sent, reply } = fakeChrome()
    const first = cdp.send('Browser.getVersion')
    const second = cdp.send('Page.navigate', { url: 'https://example.com/' }, 'session-1')
    await new Promise((resolve) => setImmediate(resolve))

    expect(sent).toEqual([
      { id: 1, method: 'Browser.getVersion', params: {} },
      { id: 2, method: 'Page.navigate', params: { url: 'https://example.com/' }, sessionId: 'session-1' },
    ])
    reply({ id: 2, result: { frameId: 'frame' } })
    reply({ id: 1, result: { product: 'Chrome/1' } })
    expect(await first).toEqual({ product: 'Chrome/1' })
    expect(await second).toEqual({ frameId: 'frame' })
  })

  it('reads messages split across chunks and several in one chunk', async () => {
    const { cdp, fromChrome } = fakeChrome()
    const events: unknown[] = []
    cdp.on('Page.loadEventFired', (params, sessionId) => events.push([params, sessionId]))
    const call = cdp.send('Target.getTargets')

    const text = `${JSON.stringify({ id: 1, result: { targetInfos: [] } })}\0${JSON.stringify({ method: 'Page.loadEventFired', params: { timestamp: 1 }, sessionId: 's' })}\0`
    fromChrome.write(text.slice(0, 10))
    fromChrome.write(text.slice(10))

    expect(await call).toEqual({ targetInfos: [] })
    expect(events).toEqual([[{ timestamp: 1 }, 's']])
  })

  it('rejects calls that Chrome answers with an error', async () => {
    const { cdp, reply } = fakeChrome()
    const call = cdp.send('Page.navigate', { url: 'nope' })
    reply({ id: 1, error: { code: -32000, message: 'Cannot navigate to invalid URL' } })
    await expect(call).rejects.toThrow('Page.navigate: Cannot navigate to invalid URL')
  })

  it('stops calling a listener once it is removed', async () => {
    const { cdp, reply } = fakeChrome()
    const events: unknown[] = []
    const stop = cdp.on('Target.targetDestroyed', (params) => events.push(params))
    reply({ method: 'Target.targetDestroyed', params: { targetId: 'a' } })
    await new Promise((resolve) => setImmediate(resolve))
    stop()
    reply({ method: 'Target.targetDestroyed', params: { targetId: 'b' } })
    await new Promise((resolve) => setImmediate(resolve))
    expect(events).toEqual([{ targetId: 'a' }])
  })

  it('rejects waiting and later calls once Chrome exits', async () => {
    const { cdp, fromChrome } = fakeChrome()
    const call = cdp.send('Browser.getVersion')
    fromChrome.end()

    await expect(call).rejects.toThrow('Chrome closed before answering Browser.getVersion.')
    await cdp.closed
    await expect(cdp.send('Browser.close')).rejects.toThrow("Chrome has closed, so Browser.close can't be sent.")
  })
})
