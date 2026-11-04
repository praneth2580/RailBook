import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../../core/settings'
import { appStore } from '../../core/storage'
import type { IrctcLogin } from '../../core/types'
import { createVault, isVaultBlob, openVault, sealVault, type OpenVault, type VaultBlob } from './vault'

const VAULT_KEY = 'loginVault'
/** Locks the logins again after this long without a key press or click in RailBook. */
export const AUTO_LOCK_MINUTES = 15

export type VaultStatus = 'loading' | 'none' | 'locked' | 'unlocked'

interface VaultContextValue {
  status: VaultStatus
  /** How many logins there are, known even while locked. */
  count: number
  /** Empty unless unlocked. */
  logins: IrctcLogin[]
  /** Starts the vault with these logins, or with the username an older profile kept. */
  create(password: string, logins?: IrctcLogin[]): Promise<void>
  /** Throws WrongPasswordError for the wrong master password. */
  unlock(password: string): Promise<void>
  lock(): void
  save(login: IrctcLogin): Promise<void>
  remove(id: string): Promise<void>
  changePassword(current: string, next: string): Promise<void>
  /** Deletes every saved login, for a forgotten master password. */
  reset(): Promise<void>
}

const VaultContext = createContext<VaultContextValue | null>(null)

/** Exactly one default: the one just marked, or the first when none is. */
function withOneDefault(logins: IrctcLogin[], preferred?: IrctcLogin) {
  if (preferred?.isDefault) return logins.map((login) => ({ ...login, isDefault: login.id === preferred.id }))
  if (logins.some((login) => login.isDefault)) return logins
  return logins.map((login, index) => ({ ...login, isDefault: index === 0 }))
}

/**
 * Holds the unlocked logins in memory only. The key can't be read out of the browser, and both are dropped when
 * RailBook locks, closes or reloads.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings()
  // undefined while loading, null when there's no vault yet.
  const [blob, setBlob] = useState<VaultBlob | null | undefined>(undefined)
  const [logins, setLogins] = useState<IrctcLogin[] | null>(null)
  const open = useRef<OpenVault | null>(null)
  const lastUse = useRef(Date.now())

  useEffect(() => {
    void appStore.get(VAULT_KEY).then((raw) => {
      const saved: unknown = raw ? JSON.parse(raw) : null
      setBlob(isVaultBlob(saved) ? saved : null)
    })
  }, [])

  const lock = () => {
    open.current = null
    setLogins(null)
  }

  useEffect(() => {
    if (!logins) return
    const used = () => (lastUse.current = Date.now())
    window.addEventListener('keydown', used)
    window.addEventListener('pointerdown', used)
    const timer = setInterval(() => {
      if (Date.now() - lastUse.current >= AUTO_LOCK_MINUTES * 60_000) lock()
    }, 30_000)
    return () => {
      window.removeEventListener('keydown', used)
      window.removeEventListener('pointerdown', used)
      clearInterval(timer)
    }
  }, [logins])

  const store = async (next: VaultBlob, opened: OpenVault) => {
    await appStore.set(VAULT_KEY, JSON.stringify(next))
    open.current = opened
    lastUse.current = Date.now()
    setBlob(next)
    setLogins(opened.logins)
  }

  const persist = async (next: IrctcLogin[]) => {
    if (!open.current) throw new Error('Unlock your logins first.')
    await store(await sealVault(open.current, next), { ...open.current, logins: next })
  }

  const value: VaultContextValue = {
    status: blob === undefined ? 'loading' : blob === null ? 'none' : logins ? 'unlocked' : 'locked',
    count: blob?.count ?? 0,
    logins: logins ?? [],
    async create(password, logins) {
      // A username saved before logins had a vault becomes the first login.
      const legacy = settings.profile.irctcUsername.trim()
      const first: IrctcLogin[] = logins
        ? withOneDefault(logins)
        : legacy
          ? [
              {
                id: crypto.randomUUID(),
                label: 'My account',
                username: legacy,
                password: '',
                mobile: settings.profile.mobile,
                email: settings.profile.email,
                note: '',
                isDefault: true,
              },
            ]
          : []
      const created = await createVault(password, first)
      await store(created.blob, created.vault)
      // A caller that passes logins saves the profile itself, so it clears the old username too.
      if (legacy && !logins) await update({ profile: { ...settings.profile, irctcUsername: '' } })
    },
    async unlock(password) {
      if (!blob) return
      const opened = await openVault(blob, password)
      open.current = opened
      lastUse.current = Date.now()
      setLogins(opened.logins)
    },
    lock,
    async save(login) {
      const current = logins ?? []
      const exists = current.some(({ id }) => id === login.id)
      const next = exists ? current.map((other) => (other.id === login.id ? login : other)) : [...current, login]
      await persist(withOneDefault(next, login))
    },
    async remove(id) {
      await persist(withOneDefault((logins ?? []).filter((login) => login.id !== id)))
    },
    async changePassword(current, next) {
      if (!blob) return
      const opened = await openVault(blob, current)
      const created = await createVault(next, opened.logins)
      await store(created.blob, created.vault)
    },
    async reset() {
      await appStore.set(VAULT_KEY, 'null')
      open.current = null
      setBlob(null)
      setLogins(null)
    },
  }

  return <VaultContext value={value}>{children}</VaultContext>
}

export function useVault() {
  const value = use(VaultContext)
  if (!value) throw new Error('useVault needs a VaultProvider')
  return value
}

/** The login a task books with: the one it names, or the default. */
export function pickLogin(logins: IrctcLogin[], id?: string) {
  return logins.find((login) => login.id === id) ?? logins.find((login) => login.isDefault) ?? logins[0]
}
