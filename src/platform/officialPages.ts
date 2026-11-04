import { URLS } from '../features/site/urls'
import { callApi } from './api'

const OFFICIAL_PAGES = {
  booking: URLS.trainSearch,
  pnr: URLS.pnrEnquiry,
}

// Opens in the person's own browser, where they're already signed in, rather than in RailBook's window.
export function openOfficialPage(page: keyof typeof OFFICIAL_PAGES) {
  return callApi('open', { url: OFFICIAL_PAGES[page] })
}
