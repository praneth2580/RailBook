import { defineTask } from '../core/define.ts'

// Use fetch(url) for pages whose data is in the HTML, and open(url) for a browser page you can click, type and
// scroll in. Return the records to save; args holds the command line's --name value options.
export default defineTask({
  description: 'TODO: what this task collects',
  async run({ log }) {
    const records: Record<string, unknown>[] = []
    log('Nothing to scrape yet. Write this task in scrapers/tasks/scrape.ts.')
    return records
  },
})
