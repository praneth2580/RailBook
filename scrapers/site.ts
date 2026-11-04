// The site these scrapers work on. Set its address and description, then list your tasks.
// Run them with: npm run scrape -- <task>
import { defineSite } from './core/define.ts'
import scrape from './tasks/scrape.ts'

export default defineSite({
  description: 'TODO: what the site is, and what the tasks collect',
  baseUrl: 'https://example.com/',
  // How human clicks, typing and scrolling look in browser pages: 'fast', 'natural' or 'careful'.
  human: 'natural',
  tasks: { scrape },
})
