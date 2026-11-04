// Every address RailBook uses goes here, split into its parts, so when a site moves a page, this is the one file to
// fix. The site helpers (siteActions.ts) match pages by PATHS on any domain, so they also work against a copy of the
// site that RAILBOOK_SITE_URL points to; official pages open at URLS. scrapers/ tasks can import it too.

/** Where each site lives: scheme and host, without a trailing slash. */
export const ORIGINS = {
  /** IRCTC, where tickets are booked. */
  irctc: 'https://www.irctc.co.in',
  /** Indian Railways' enquiry site, for PNR status. */
  indianRail: 'https://www.indianrail.gov.in',
} as const

/** Parts that several paths share. */
export const PATH_PARTS = {
  /** The start of every page in IRCTC's booking app. */
  irctcApp: '/nget',
} as const

/** Pages, as paths without the domain. */
export const PATHS = {
  /** IRCTC's train search, where booking starts. Its header has the menu with LOGIN / REGISTER. */
  trainSearch: `${PATH_PARTS.irctcApp}/train-search`,
  /** Indian Railways' PNR enquiry. */
  pnrEnquiry: '/enquiry/PNR/PnrEnquiry.html',
} as const

/** Query parameters pages need. */
export const QUERIES = {
  /** Shows Indian Railways' enquiry pages in English. */
  english: { locale: 'en' },
} as const

/** An address from its parts: url(ORIGINS.irctc, PATHS.trainSearch, { from: 'NDLS' }). */
export function url(origin: string, path: string, query: Readonly<Record<string, string>> = {}) {
  const address = new URL(path, origin)
  for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value)
  return address.href
}

/** Whole addresses RailBook opens. */
export const URLS = {
  /** Where booking starts, opened in the person's own browser. */
  trainSearch: url(ORIGINS.irctc, PATHS.trainSearch),
  /** PNR status, opened in the person's own browser. */
  pnrEnquiry: url(ORIGINS.indianRail, PATHS.pnrEnquiry, QUERIES.english),
} as const

/**
 * The path of an address, to compare with PATHS: no trailing slash, query or #fragment. Empty for something that
 * isn't an address.
 */
export function pathOf(address: string) {
  try {
    return new URL(address).pathname.replace(/\/+$/, '') || '/'
  } catch {
    return ''
  }
}
