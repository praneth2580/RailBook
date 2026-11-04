import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Fields } from '../../automation/fields'
import type { PageAction } from '../../automation/render'
import { actOnSite, extractFromSite, getSiteInfo, openOnSite, type SiteInfo } from '../../platform/site'

/** 'off' means RAILBOOK_SITE_URL isn't set, so there's no companion site. */
export type SiteStatus = 'loading' | 'off' | 'ready'

interface SiteContextValue {
  status: SiteStatus
  /** Where the page is, once it's open. */
  info: SiteInfo | null
  refresh(): Promise<void>
  extract<T = Record<string, unknown>>(schema: Fields): Promise<T>
  open(url: string): Promise<void>
  act(options: { actions?: PageAction[]; waitFor?: string }): Promise<void>
}

const SiteContext = createContext<SiteContextValue | null>(null)

/**
 * Puts the companion website in React context, so any component can read it and act on it. When no companion site is
 * configured, status is 'off' and the methods do nothing.
 */
export function SiteProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SiteStatus>('loading')
  const [info, setInfo] = useState<SiteInfo | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await getSiteInfo()
      setInfo(next)
      setStatus('ready')
    } catch {
      // The API answers 404 when RAILBOOK_SITE_URL isn't set.
      setStatus('off')
      setInfo(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value: SiteContextValue = {
    status,
    info,
    refresh,
    extract: (schema) => extractFromSite(schema),
    open: async (url) => setInfo(await openOnSite(url)),
    act: async (options) => setInfo(await actOnSite(options)),
  }
  return <SiteContext value={value}>{children}</SiteContext>
}

export function useSite() {
  const value = use(SiteContext)
  if (!value) throw new Error('useSite needs a SiteProvider')
  return value
}
