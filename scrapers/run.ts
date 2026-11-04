// npm run scrape                                   list the tasks
// npm run scrape -- <task> [--headed] [--csv] [--name value ...]
import { parseCommandLine } from './core/cli.ts'
import { runTask } from './core/runner.ts'
import site from './site.ts'

try {
  const { task, flags, args } = parseCommandLine(process.argv.slice(2))
  if (!task) {
    console.log(`${site.baseUrl}\n${site.description}\n\nTasks:`)
    for (const [name, { description }] of Object.entries(site.tasks)) console.log(`  ${name.padEnd(12)} ${description}`)
    console.log('\nRun one: npm run scrape -- <task> [--headed] [--csv] [--name value ...]')
  } else {
    await runTask(site, task, { headed: flags.has('headed'), csv: flags.has('csv'), args })
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
