import { describe, expect, it } from 'vitest'
import { createCollection, createDocument, type KeyValueStore } from './storage'

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>()
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value)
    },
  }
}

describe('createCollection', () => {
  it('starts empty', async () => {
    expect(await createCollection('items', memoryStore()).list()).toEqual([])
  })

  it('adds, updates in place and removes items', async () => {
    const collection = createCollection<{ id: string; name: string }>('items', memoryStore())

    await collection.save({ id: 'a', name: 'first' })
    await collection.save({ id: 'b', name: 'second' })
    await collection.save({ id: 'a', name: 'changed' })
    expect(await collection.list()).toEqual([
      { id: 'a', name: 'changed' },
      { id: 'b', name: 'second' },
    ])

    await collection.remove('a')
    expect(await collection.list()).toEqual([{ id: 'b', name: 'second' }])
  })
})

describe('createDocument', () => {
  const defaults = { theme: 'system', minutes: [15] }

  it('returns the defaults before anything is stored', async () => {
    expect(await createDocument('settings', defaults, memoryStore()).get()).toEqual(defaults)
  })

  it('merges updates over what is stored', async () => {
    const settings = createDocument('settings', defaults, memoryStore())

    await settings.update({ theme: 'dark' })
    expect(await settings.update({ minutes: [5, 1] })).toEqual({ theme: 'dark', minutes: [5, 1] })
  })

  it('fills fields added after the value was stored', async () => {
    const store = memoryStore()
    await store.set('settings', JSON.stringify({ theme: 'light' }))

    expect(await createDocument('settings', defaults, store).get()).toEqual({ theme: 'light', minutes: [15] })
  })
})
