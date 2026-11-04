import { useEffect, useRef } from 'react'
import { useToast } from '../../ui/toast'
import { helpersForPage } from './siteActions'
import { useSite } from './SiteProvider'

/**
 * Runs the helpers in siteActions' ON_PAGE_LOAD when the companion page arrives at their path. It sees the arrivals
 * the app knows about: the page opening when RailBook starts, and site.open and site.act moving it.
 */
export function SiteAutomations() {
  const site = useSite()
  const toast = useToast()
  const url = site.info?.url
  // Once per arrival: staying on the page doesn't run them again, and neither does StrictMode's second effect.
  const handled = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!url || url === handled.current) return
    handled.current = url
    for (const run of helpersForPage(url)) {
      void run(site).catch((error: unknown) =>
        toast(`Companion site: ${error instanceof Error ? error.message : String(error)}`),
      )
    }
  }, [url, site, toast])

  return null
}
