import { createWraith } from 'wraithjs'

export const USER_AGENT = 'RailBook-scrapers/0.1'

export interface WraithOptions {
  /** Show the browser, to watch a task work. */
  headed?: boolean
  minDelayMs?: number
}

/**
 * WRAITH set up the way every scraper here runs: robots.txt respected, one request at a time per site with a gap
 * between them, honest about who's asking, and input that isn't made to look human. CHROME_PATH picks the browser;
 * otherwise the installed Google Chrome is used.
 */
export function createPoliteWraith({ headed = false, minDelayMs = 1000 }: WraithOptions = {}) {
  return createWraith({
    headless: !headed,
    launch: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
    human: 'off',
    userAgent: USER_AGENT,
    // Pictures make no difference to the data, but they do when you're watching.
    blockResources: headed ? [] : ['image', 'font', 'media'],
    network: {
      timeout: 30_000,
      retries: 2,
      respectRobotsTxt: true,
      rateLimit: { concurrency: 1, maxRequests: 1, intervalMs: minDelayMs },
    },
  })
}
