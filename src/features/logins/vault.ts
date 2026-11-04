import type { IrctcLogin } from '../../core/types'

/**
 * The login vault: every saved IRCTC login, encrypted together with AES-256-GCM under a key derived from the master
 * password with PBKDF2-SHA-256. Only the ciphertext is saved, and the master password never is, so without it the
 * logins can't be read, by anyone, RailBook included.
 */
export interface VaultBlob {
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  iv: string
  data: string
  /** How many logins it holds, so a locked vault can say so. Not secret. */
  count: number
}

export interface OpenVault {
  key: CryptoKey
  kdf: VaultBlob['kdf']
  logins: IrctcLogin[]
}

/** OWASP's recommendation for PBKDF2-SHA-256. Takes a fraction of a second, once per unlock. */
export const ITERATIONS = 600_000
export const MIN_PASSWORD_LENGTH = 8
// Binds the ciphertext to this use, so it can't be passed off as some other RailBook data.
const CONTEXT = new TextEncoder().encode('railbook-login-vault-v1')

export class WrongPasswordError extends Error {
  constructor() {
    super("That master password doesn't open your logins.")
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string) {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
}

async function deriveKey(password: string, kdf: VaultBlob['kdf']) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: kdf.hash, salt: fromBase64(kdf.salt), iterations: kdf.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    // The key can encrypt and decrypt, but never be read back out of the browser.
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Encrypts the logins again, with a fresh IV each time. */
export async function sealVault({ key, kdf }: Omit<OpenVault, 'logins'>, logins: IrctcLogin[]): Promise<VaultBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(logins))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: CONTEXT }, key, plaintext)
  return { version: 1, kdf, iv: toBase64(iv), data: toBase64(new Uint8Array(ciphertext)), count: logins.length }
}

export async function createVault(password: string, logins: IrctcLogin[] = [], iterations = ITERATIONS) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters for the master password.`)
  }
  const kdf: VaultBlob['kdf'] = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: toBase64(crypto.getRandomValues(new Uint8Array(16))),
  }
  const key = await deriveKey(password, kdf)
  return { blob: await sealVault({ key, kdf }, logins), vault: { key, kdf, logins } satisfies OpenVault }
}

/** Throws WrongPasswordError when the password is wrong, or the saved vault has been tampered with. */
export async function openVault(blob: VaultBlob, password: string): Promise<OpenVault> {
  const key = await deriveKey(password, blob.kdf)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(blob.iv), additionalData: CONTEXT },
      key,
      fromBase64(blob.data),
    )
  } catch {
    throw new WrongPasswordError()
  }
  return { key, kdf: blob.kdf, logins: JSON.parse(new TextDecoder().decode(plaintext)) as IrctcLogin[] }
}

export function isVaultBlob(value: unknown): value is VaultBlob {
  if (typeof value !== 'object' || value === null) return false
  const blob = value as Partial<VaultBlob>
  return blob.version === 1 && typeof blob.data === 'string' && typeof blob.iv === 'string' && !!blob.kdf?.salt
}
