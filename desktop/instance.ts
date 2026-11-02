import { readFile, rm, writeFile } from 'node:fs/promises'

// One RailBook at a time: the app window's browser profile can only be open in one browser process.
interface InstanceInfo {
  origin: string
  secret: string
}

/** Asks a RailBook that is already open to bring its window forward. Returns false if none answers. */
export async function focusRunningInstance(file: string) {
  try {
    const { origin, secret } = JSON.parse(await readFile(file, 'utf8')) as InstanceInfo
    const response = await fetch(`${origin}/instance/focus`, {
      method: 'POST',
      headers: { 'X-RailBook-Instance': secret },
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    // No file, or it was left behind by a RailBook that didn't shut down cleanly.
    return false
  }
}

export function claimInstance(file: string, info: InstanceInfo) {
  return writeFile(file, JSON.stringify(info), { mode: 0o600 })
}

/** Removes the file, unless a newer RailBook has claimed it since. */
export async function releaseInstance(file: string, secret: string) {
  try {
    const info = JSON.parse(await readFile(file, 'utf8')) as InstanceInfo
    if (info.secret === secret) await rm(file, { force: true })
  } catch {
    // Already gone.
  }
}
