import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'

/** Where RailBook keeps its data, the app window's browser profile and its log. RAILBOOK_DATA_DIR overrides it. */
export function dataDirectory(platform: NodeJS.Platform = process.platform, env = process.env, home = homedir()) {
  if (env.RAILBOOK_DATA_DIR) return env.RAILBOOK_DATA_DIR
  if (platform === 'win32') return path.win32.join(env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'), 'RailBook')
  if (platform === 'darwin') return path.posix.join(home, 'Library', 'Application Support', 'RailBook')
  return path.posix.join(env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config'), 'RailBook')
}

export function openCommand(url: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  // rundll32 hands the address to the default browser without going through a shell that would split it at "&".
  if (platform === 'win32') return ['rundll32', ['url.dll,FileProtocolHandler', url]]
  if (platform === 'darwin') return ['open', [url]]
  return ['xdg-open', [url]]
}

/** Opens a web address in the person's default browser. */
export function openExternal(url: string) {
  const [command, args] = openCommand(url)
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', reject)
    child.on('spawn', () => {
      child.unref()
      resolve()
    })
  })
}
