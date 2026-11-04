import { callApi } from './api'

/** Only answered under npm run dev. */
export function getScrapingBrowser() {
  return callApi<{ headless: boolean }>('dev/scraping-browser', {})
}

export function setScrapingBrowser(headless: boolean) {
  return callApi<{ headless: boolean }>('dev/scraping-browser/set', { headless })
}
