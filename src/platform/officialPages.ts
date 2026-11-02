import { callApi } from './api'

const OFFICIAL_PAGES = {
  booking: 'https://www.irctc.co.in/nget/train-search',
  pnr: 'https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en',
}

// Opens in the person's own browser, where they're already signed in, rather than in RailBook's window.
export function openOfficialPage(page: keyof typeof OFFICIAL_PAGES) {
  return callApi('open', { url: OFFICIAL_PAGES[page] })
}
