import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type { Readable, Writable } from 'node:stream'
import { connectCdp, type Cdp } from './cdp'

// Any Chromium-based browser works: they all support --app windows and the DevTools pipe.
const LINUX_NAMES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
  'microsoft-edge-stable',
  'microsoft-edge',
  'brave-browser',
]
const MAC_APPS = [
  'Google Chrome.app/Contents/MacOS/Google Chrome',
  'Chromium.app/Contents/MacOS/Chromium',
  'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  'Brave Browser.app/Contents/MacOS/Brave Browser',
]
// Edge comes with Windows 10 and 11, so there is always something to fall back on.
const WINDOWS_PATHS = [
  'Google\\Chrome\\Application\\chrome.exe',
  'Microsoft\\Edge\\Application\\msedge.exe',
  'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'Chromium\\Application\\chrome.exe',
]

export interface FindOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  exists?: (file: string) => boolean
}

/** RAILBOOK_CHROME wins when it is set. Returns null when no supported browser is installed. */
export function findChrome({
  platform = process.platform,
  env = process.env,
  home = env.HOME ?? env.USERPROFILE ?? '',
  exists = existsSync,
}: FindOptions = {}): string | null {
  if (env.RAILBOOK_CHROME) return env.RAILBOOK_CHROME

  let candidates: string[]
  if (platform === 'win32') {
    const roots = [env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)']].filter((root) => root !== undefined)
    candidates = WINDOWS_PATHS.flatMap((file) => roots.map((root) => path.win32.join(root, file)))
  } else if (platform === 'darwin') {
    candidates = MAC_APPS.flatMap((app) => [path.posix.join('/Applications', app), path.posix.join(home, 'Applications', app)])
  } else {
    const directories = (env.PATH ?? '').split(':').filter(Boolean)
    candidates = LINUX_NAMES.flatMap((name) => directories.map((directory) => path.posix.join(directory, name)))
  }
  return candidates.find((file) => exists(file)) ?? null
}

export interface Chrome {
  cdp: Cdp
  /** Settles with the exit code once the browser process has gone. */
  exited: Promise<number | null>
  /** The end of what Chrome printed, for error messages. */
  output(): string
  kill(): void
}

export function launchChrome(executable: string, args: string[]): Chrome {
  const child = spawn(executable, ['--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', ...args], {
    // Chrome reads DevTools commands from fd 3 and writes replies to fd 4.
    stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'],
  })
  let output = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => {
    output = (output + chunk).slice(-2000)
  })

  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code))
    child.on('error', (error) => {
      output += `\n${error.message}`
      resolve(null)
    })
  })

  return {
    cdp: connectCdp(child.stdio[3] as Writable, child.stdio[4] as Readable),
    exited,
    output: () => output.trim(),
    kill: () => {
      child.kill()
    },
  }
}

/** Confirms the browser is up and answering, or explains why it isn't. */
export async function waitForChrome(chrome: Chrome, timeoutMs = 20_000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const failure = Promise.race([
    chrome.exited.then(() => 'it closed straight away'),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve(`it didn't answer within ${timeoutMs / 1000} seconds`), timeoutMs)
    }),
  ]).then((reason) => {
    throw new Error(`Couldn't start the browser: ${reason}.\n${chrome.output()}`.trim())
  })
  try {
    return await Promise.race([chrome.cdp.send<{ product: string; userAgent: string }>('Browser.getVersion'), failure])
  } finally {
    clearTimeout(timer)
    failure.catch(() => undefined)
  }
}
