import { callApi } from './api'
import type { Fields } from '../automation/fields'
import type { PageAction } from '../automation/render'

/** The companion website the launcher keeps open. Set by RAILBOOK_SITE_URL; the API 404s when it isn't. */
export interface SiteInfo {
  configuredUrl: string
  /** Where the page is now. */
  url: string
  title: string
  headless: boolean
}

/** Opens the page if needed and reports where it is. Rejects when no companion site is configured. */
export function getSiteInfo() {
  return callApi<SiteInfo>('site/info', {})
}

/** Reads the live page with a WRAITH selector schema. */
export function extractFromSite<T = Record<string, unknown>>(schema: Fields) {
  return callApi<T>('site/extract', { schema })
}

/** Navigates the page to another address. */
export function openOnSite(url: string) {
  return callApi<SiteInfo>('site/open', { url })
}

/** Runs clicks, typing, scrolling and waits on the page, in order. */
export function actOnSite(options: { actions?: PageAction[]; waitFor?: string }) {
  return callApi<SiteInfo>('site/act', options)
}
