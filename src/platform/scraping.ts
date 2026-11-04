import type { HumanLevel } from '../automation/human'
import { callApi } from './api'

/** How human the scraping browsers' clicks, typing and scrolling look. */
export function getHumanLevel() {
  return callApi<{ human: HumanLevel }>('scraping/human', {})
}

/** Applies from the next rendered page; the companion website reopens where it is. */
export function setHumanLevel(human: HumanLevel) {
  return callApi<{ human: HumanLevel }>('scraping/human/set', { human })
}
