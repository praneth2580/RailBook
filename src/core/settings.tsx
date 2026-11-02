import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { createDocument } from './storage'
import type { Settings } from './types'

const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'system',
  alertMinutes: [15, 5, 1],
  profile: { name: '', irctcUsername: '', mobile: '', email: '' },
  practiceBestSeconds: null,
}

const settingsDocument = createDocument('settings', DEFAULT_SETTINGS)

interface SettingsContextValue {
  settings: Settings
  update(patch: Partial<Settings>): Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

/** Loads settings before rendering its children, so screens never see placeholder values. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void settingsDocument.get().then(setSettings)
  }, [])

  const theme = settings?.theme
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
  }, [theme])

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await settingsDocument.update(patch))
  }, [])

  if (!settings) return null
  return <SettingsContext value={{ settings, update }}>{children}</SettingsContext>
}

export function useSettings() {
  const value = use(SettingsContext)
  if (!value) throw new Error('useSettings needs a SettingsProvider')
  return value
}
