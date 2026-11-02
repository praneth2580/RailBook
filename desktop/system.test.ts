import { describe, expect, it } from 'vitest'
import { findChrome } from './chrome'
import { dataDirectory, openCommand } from './system'

describe('findChrome', () => {
  const installed = (...files: string[]) => (file: string) => files.includes(file)

  it('uses RAILBOOK_CHROME when it is set', () => {
    expect(findChrome({ env: { RAILBOOK_CHROME: '/opt/chrome/chrome' }, exists: () => false })).toBe('/opt/chrome/chrome')
  })

  it('searches PATH on Linux, preferring Chrome', () => {
    const env = { PATH: '/usr/local/bin:/usr/bin' }
    expect(findChrome({ platform: 'linux', env, exists: installed('/usr/bin/chromium', '/usr/bin/google-chrome') })).toBe(
      '/usr/bin/google-chrome',
    )
    expect(findChrome({ platform: 'linux', env, exists: installed('/usr/bin/chromium') })).toBe('/usr/bin/chromium')
  })

  it('looks in both Applications folders on macOS', () => {
    const app = '/Users/me/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    expect(findChrome({ platform: 'darwin', env: {}, home: '/Users/me', exists: installed(app) })).toBe(app)
  })

  it('falls back to Edge on Windows', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files' }
    const edge = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    expect(findChrome({ platform: 'win32', env, exists: installed(edge) })).toBe(edge)
  })

  it('returns null when nothing is installed', () => {
    expect(findChrome({ platform: 'linux', env: { PATH: '/usr/bin' }, exists: () => false })).toBeNull()
  })
})

describe('dataDirectory', () => {
  it("follows each platform's convention", () => {
    expect(dataDirectory('linux', {}, '/home/me')).toBe('/home/me/.config/RailBook')
    expect(dataDirectory('linux', { XDG_CONFIG_HOME: '/xdg' }, '/home/me')).toBe('/xdg/RailBook')
    expect(dataDirectory('darwin', {}, '/Users/me')).toBe('/Users/me/Library/Application Support/RailBook')
    expect(dataDirectory('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'C:\\Users\\me')).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\RailBook',
    )
  })

  it('uses RAILBOOK_DATA_DIR when it is set', () => {
    expect(dataDirectory('linux', { RAILBOOK_DATA_DIR: '/tmp/rb' }, '/home/me')).toBe('/tmp/rb')
  })
})

describe('openCommand', () => {
  it('passes the address as one argument, so "&" in it is safe', () => {
    const url = 'https://example.com/?a=1&b=2'
    expect(openCommand(url, 'linux')).toEqual(['xdg-open', [url]])
    expect(openCommand(url, 'darwin')).toEqual(['open', [url]])
    expect(openCommand(url, 'win32')).toEqual(['rundll32', ['url.dll,FileProtocolHandler', url]])
  })
})
