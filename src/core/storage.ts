import { Preferences } from '@capacitor/preferences'
import { useCallback, useEffect, useState } from 'react'

export interface KeyValueStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

// Preferences is plain app storage on Android, not encrypted storage.
const deviceStore: KeyValueStore = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: (key, value) => Preferences.set({ key, value }),
}

export function clearDeviceData() {
  return Preferences.clear()
}

export interface Collection<T extends { id: string }> {
  list(): Promise<T[]>
  save(item: T): Promise<T[]>
  remove(id: string): Promise<T[]>
}

export function createCollection<T extends { id: string }>(
  key: string,
  store: KeyValueStore = deviceStore,
): Collection<T> {
  const list = async () => {
    const raw = await store.get(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  }
  const write = async (items: T[]) => {
    await store.set(key, JSON.stringify(items))
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
  }
}

export function useCollection<T extends { id: string }>(collection: Collection<T>) {
  const [items, setItems] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void collection.list().then((stored) => {
      setItems(stored)
      setLoaded(true)
    })
  }, [collection])

  const save = useCallback(async (item: T) => setItems(await collection.save(item)), [collection])
  const remove = useCallback(async (id: string) => setItems(await collection.remove(id)), [collection])

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
  store: KeyValueStore = deviceStore,
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
