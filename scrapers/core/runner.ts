import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WraithPage } from 'wraithjs'
import type { Site, TaskContext } from './define.ts'
import { assertAllowed } from './guard.ts'
import { saveResults } from './output.ts'
import { createPoliteWraith } from './wraith.ts'

export const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'output')

export interface RunOptions {
  headed?: boolean
  csv?: boolean
  args?: Record<string, string>
  outputDir?: string
  log?: (message: string) => void
}

/** Runs one of the site's tasks, saves what it returns and closes the browser. */
export async function runTask(site: Site, taskName: string, options: RunOptions = {}) {
  const { headed = false, csv = false, args = {}, outputDir = OUTPUT_DIR, log = console.log } = options
  const task = site.tasks[taskName]
  if (!task) throw new Error(`There's no task "${taskName}". The tasks: ${Object.keys(site.tasks).join(', ')}`)
  const baseUrl = assertAllowed(site.baseUrl)

  const wraith = createPoliteWraith({ headed, minDelayMs: site.minDelayMs })
  const opened: WraithPage[] = []
  const context: TaskContext = {
    baseUrl,
    args,
    url: (address) => new URL(address, baseUrl).href,
    fetch: (address) => wraith.fetch(assertAllowed(context.url(address))),
    async open(address) {
      const page = await wraith.open(assertAllowed(context.url(address)))
      opened.push(page)
      return page
    },
    log: (message) => log(`  ${message}`),
    wraith,
  }

  try {
    log(`${taskName}: ${task.description}`)
    const records = await task.run(context)
    const files = await saveResults(outputDir, taskName, records, { csv })
    log(`${records.length} records saved to ${files.map((file) => path.relative(process.cwd(), file)).join(' and ')}`)
    return { records, files }
  } finally {
    await Promise.all(opened.map((page) => page.close().catch(() => undefined)))
    await wraith.close()
  }
}
