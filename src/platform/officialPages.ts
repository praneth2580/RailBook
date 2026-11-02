import { Browser } from '@capacitor/browser'

const OFFICIAL_PAGES = {
  booking: 'https://www.irctc.co.in/nget/train-search',
  pnr: 'https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html?locale=en',
}

export function openOfficialPage(page: keyof typeof OFFICIAL_PAGES) {
  return Browser.open({ url: OFFICIAL_PAGES[page] })
}
