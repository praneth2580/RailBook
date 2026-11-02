import { readFile, rename, writeFile } from 'node:fs/promises'

export interface FileStore {
  get(key: string): string | null
  set(key: string, value: string): Promise<void>
  clear(): Promise<void>
}

/** Everything the app saves, kept in memory and written to one JSON file after each change. */
export async function openStore(file: string): Promise<FileStore> {
  let values: Record<string, string> = {}
  try {
    values = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
    // Keep a damaged file for recovery instead of overwriting it with an empty store.
    if (!missing) await rename(file, `${file}.damaged-${Date.now()}`)
  }

  let writing = Promise.resolve()
  const persist = () => {
    const snapshot = JSON.stringify(values)
    // Write a copy, then swap it in, so a crash mid-write can't leave half a file.
    writing = writing.catch(() => undefined).then(async () => {
      await writeFile(`${file}.tmp`, snapshot, { mode: 0o600 })
      await rename(`${file}.tmp`, file)
    })
    return writing
  }

  return {
    get: (key) => values[key] ?? null,
    set: (key, value) => {
      values[key] = value
      return persist()
    },
    clear: () => {
      values = {}
      return persist()
    },
  }
}
