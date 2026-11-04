import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { preparePreferences } from './window'

const preferencesOf = async (profile: string) =>
  JSON.parse(await readFile(path.join(profile, 'Default', 'Preferences'), 'utf8'))

describe('preparePreferences', () => {
  it("turns off the browser's password saving in a new profile", async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'railbook-profile-'))
    await preparePreferences(profile)
    expect(await preferencesOf(profile)).toEqual({
      credentials_enable_service: false,
      credentials_enable_autosignin: false,
      profile: { password_manager_enabled: false },
    })
  })

  it('keeps the rest of an existing profile', async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'railbook-profile-'))
    await mkdir(path.join(profile, 'Default'), { recursive: true })
    await writeFile(
      path.join(profile, 'Default', 'Preferences'),
      JSON.stringify({ credentials_enable_service: true, profile: { name: 'Person 1' }, browser: { window: 1 } }),
    )
    await preparePreferences(profile)
    expect(await preferencesOf(profile)).toEqual({
      credentials_enable_service: false,
      credentials_enable_autosignin: false,
      profile: { name: 'Person 1', password_manager_enabled: false },
      browser: { window: 1 },
    })
  })
})
