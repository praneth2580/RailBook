import { describe, expect, it } from 'vitest'
import type { IrctcLogin } from '../../core/types'
import { createVault, ITERATIONS, isVaultBlob, openVault, sealVault, WrongPasswordError } from './vault'

const login: IrctcLogin = {
  id: 'a',
  label: 'Mine',
  username: 'praneth_p',
  password: 'correct horse battery',
  mobile: '9876543210',
  email: '',
  note: '',
  isDefault: true,
}

describe('login vault', () => {
  it('saves only ciphertext, and the right master password opens it', async () => {
    const { blob } = await createVault('master password', [login])

    expect(JSON.stringify(blob)).not.toContain('praneth_p')
    expect(JSON.stringify(blob)).not.toContain('correct horse')
    expect(blob).toMatchObject({
      version: 1,
      count: 1,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS },
    })
    expect((await openVault(blob, 'master password')).logins).toEqual([login])
  })

  it('refuses the wrong master password', async () => {
    const { blob } = await createVault('master password', [login])
    await expect(openVault(blob, 'Master password')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('notices a vault that has been tampered with', async () => {
    const { blob } = await createVault('master password', [login])
    const bytes = Uint8Array.from(atob(blob.data), (character) => character.charCodeAt(0))
    bytes[0] = (bytes[0] ?? 0) ^ 1
    const tampered = { ...blob, data: btoa(String.fromCharCode(...bytes)) }
    await expect(openVault(tampered, 'master password')).rejects.toBeInstanceOf(WrongPasswordError)
  })

  it('uses a fresh salt and IV each time, so equal logins never look equal', async () => {
    const first = await createVault('master password', [login])
    const second = await createVault('master password', [login])
    expect(first.blob.kdf.salt).not.toBe(second.blob.kdf.salt)

    const resealed = await sealVault(first.vault, [login])
    expect(resealed.iv).not.toBe(first.blob.iv)
    expect(resealed.data).not.toBe(first.blob.data)
    expect((await openVault(resealed, 'master password')).logins).toEqual([login])
  })

  it('needs a master password of at least 8 characters', async () => {
    await expect(createVault('short')).rejects.toThrow('at least 8 characters')
  })

  it('recognises a saved vault', async () => {
    const { blob } = await createVault('master password')
    expect(isVaultBlob(JSON.parse(JSON.stringify(blob)))).toBe(true)
    expect(isVaultBlob(null)).toBe(false)
    expect(isVaultBlob({ version: 1 })).toBe(false)
  })
})
