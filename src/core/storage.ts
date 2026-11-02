import { useCallback, useEffect, useState } from 'react'
import { callApi } from '../platform/api'

export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

// The launcher keeps these in a plain JSON file in RailBook's data folder. It isn't encrypted.
const appStore: KeyValueStore = {
  get: async (key) => (await callApi<{ value: string | null }>('store/get', { key })).value,
  set: async (key, value) => {
    await callApi('store/set', { key, value })
  },
}

export async function clearAppData() {
  await callApi('store/clear', {})
}

export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>
  save(item: T): Promise<T[]>
  remove(id: string): Promise<T[]>
  /** Hears the new list after every save or remove, wherever it happened. Returns a function that stops it. */
  subscribe(listener: (items: T[]) => void): () => void
}

export function createCollection<T extends { id: string }>(
  key: string,
  store: KeyValueStore = appStore,
): Collection<T> {
  const listeners = new Set<(items: T[]) => void>()
  const list = async () => {
    const raw = await store.get(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  }
  const write = async (items: T[]) => {
    await store.set(key, JSON.stringify(items))
    for (const listener of listeners) listener(items)
    return items
  }

  return {
    list,
    save: async (item) => {
      const items = await list()
      const exists = items.some(({ id }) => id === item.id)
      return write(exists ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item])
    },
    remove: async (id) => write((await list()).filter((item) => item.id !== id)),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Every screen using the same collection sees the same items, so the sidebar and pages stay in step. */
export function useCollection<T extends { id: string }>(collection: Collection<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let current = true
    const stop = collection.subscribe(setItems)
    void collection.list().then((stored) => {
      if (!current) return
      setItems(stored)
      setLoaded(true)
    })
    return () => {
      current = false
      stop()
    }
  }, [collection])

  const save = useCallback(async (item: T) => void (await collection.save(item)), [collection])
  const remove = useCallback(async (id: string) => void (await collection.remove(id)), [collection])

  return { items, loaded, save, remove }
}

/** A single stored object. Stored values are merged over the defaults, so new fields get their default. */
export interface StoredDocument<T extends object> {
  get(): Promise<T>
  update(patch: Partial<T>): Promise<T>
}

export function createDocument<T extends object>(
  key: string,
  defaults: T,
  store: KeyValueStore = appStore,
): StoredDocument<T> {
  const get = async () => {
    const raw = await store.get(key)
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults
  }

  return {
    get,
    update: async (patch) => {
      const value = { ...(await get()), ...patch }
      await store.set(key, JSON.stringify(value))
      return value
    },
  }
}
