import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStore } from './store'

async function tempFile() {
  return path.join(await mkdtemp(path.join(tmpdir(), 'railbook-store-')), 'data.json')
}

describe('openStore', () => {
  it('starts empty without a file', async () => {
    expect((await openStore(await tempFile())).get('passengers')).toBeNull()
  })

  it('keeps values across restarts', async () => {
    const file = await tempFile()
    const store = await openStore(file)
    await store.set('passengers', '[]')
    await store.set('settings', '{"theme":"dark"}')

    const reopened = await openStore(file)
    expect(reopened.get('settings')).toBe('{"theme":"dark"}')
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ passengers: '[]', settings: '{"theme":"dark"}' })
  })

  it('clears everything', async () => {
    const file = await tempFile()
    const store = await openStore(file)
    await store.set('passengers', '[]')
    await store.clear()
    expect((await openStore(file)).get('passengers')).toBeNull()
  })

  it('keeps writes in order when they overlap', async () => {
    const file = await tempFile()
    const store = await openStore(file)
    await Promise.all([store.set('a', '1'), store.set('a', '2'), store.set('b', '3')])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ a: '2', b: '3' })
  })

  it('sets a damaged file aside instead of overwriting it', async () => {
    const file = await tempFile()
    await writeFile(file, '{ not json')
    const store = await openStore(file)

    expect(store.get('anything')).toBeNull()
    const kept = (await readdir(path.dirname(file))).find((name) => name.startsWith('data.json.damaged-'))
    expect(await readFile(path.join(path.dirname(file), kept ?? ''), 'utf8')).toBe('{ not json')
  })
})
