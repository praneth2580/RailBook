import type { StaticPage, Wraith, WraithPage } from 'wraithjs'

/** Everything a task gets to work with. */
export interface TaskContext {
  /** The site's base address. */
  baseUrl: string
  /** Extra --name value options from the command line. */
  args: Record<string, string>
  /** Resolves a path such as "/catalogue/page-2.html" against baseUrl. */
  url(path: string): string
  /** A plain HTTP request: fast, but the page's JavaScript doesn't run. */
  fetch(url: string): Promise<StaticPage>
  /** A browser tab with the page loaded and its JavaScript run. Tabs left open are closed when the task ends. */
  open(url: string): Promise<WraithPage>
  log(message: string): void
  /** WRAITH itself, for anything the helpers above don't cover. */
  wraith: Wraith
}

/** One thing to do on a site. It returns the records to save. */
export interface Task<R extends Record<string, unknown> = Record<string, unknown>> {
  description: string
  run(context: TaskContext): Promise<R[]>
}

export interface Site {
  description: string
  baseUrl: string
  /** Smallest gap between requests to this site. Default 1000 ms; a robots.txt Crawl-delay can make it longer. */
  minDelayMs?: number
  tasks: Record<string, Task>
}

/** Gives the site's definition its types. scrapers/site.ts exports it as default. */
export function defineSite(site: Site) {
  return site
}

export function defineTask<R extends Record<string, unknown>>(task: Task<R>): Task {
  return task as unknown as Task
}
