import { mkdtemp, readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findChrome } from '../../desktop/chrome'
import { parseCommandLine } from './cli.ts'
import { assertAllowed } from './guard.ts'
import { toCsv } from './output.ts'
import site from '../site.ts'
import { defineSite, defineTask } from './define.ts'
import { runTask } from './runner.ts'

describe('parseCommandLine', () => {
  it('reads the task, flags and named options', () => {
    const { task, flags, args } = parseCommandLine([
      'quotes',
      '--headed',
      '--pages',
      '3',
      '--author=Jane Austen',
      '--csv',
    ])
    expect({ task, flags: [...flags], args }).toEqual({
      task: 'quotes',
      flags: ['headed', 'csv'],
      args: { pages: '3', author: 'Jane Austen' },
    })
  })

  it('says when an option is missing its value', () => {
    expect(() => parseCommandLine(['quotes', '--pages'])).toThrow('--pages needs a value.')
    expect(() => parseCommandLine(['quotes', '--pages', '--csv'])).toThrow('--pages needs a value.')
  })
})

describe('toCsv', () => {
  it('has a column for every field and escapes what needs escaping', () => {
    const csv = toCsv([
      { title: 'Plain', tags: ['a', 'b'] },
      { title: 'Has "quotes", and a comma', price: 12.5, extra: { nested: true } },
    ])
    expect(csv.split('\r\n')).toEqual([
      '﻿title,tags,price,extra',
      'Plain,a; b,,',
      '"Has ""quotes"", and a comma",,12.5,"{""nested"":true}"',
      '',
    ])
  })
})

describe('assertAllowed', () => {
  it('lets ordinary web pages through', () => {
    expect(assertAllowed('https://books.toscrape.com/catalogue/page-1.html')).toBe(
      'https://books.toscrape.com/catalogue/page-1.html',
    )
  })

  it('refuses anything but http(s)', () => {
    expect(() => assertAllowed('ftp://example.com/file')).toThrow('Only http and https pages')
    expect(() => assertAllowed('not a url')).toThrow('Not a web address')
  })
})

describe('site.ts', () => {
  it('names a web address and lists its tasks', () => {
    expect(() => assertAllowed(site.baseUrl)).not.toThrow()
    expect(Object.keys(site.tasks)).toEqual(['scrape'])
  })
})

let server: Server
let origin = ''

beforeAll(async () => {
  const pages: Record<string, string> = {
    '/': '<ul><li><a href="/item/1">One</a></li><li><a href="/item/2">Two</a></li></ul><a class="next" href="/page2">Next</a>',
    '/page2': '<ul><li><a href="/item/3">Three</a></li></ul>',
    '/app': '<div id="app"></div><script>app.innerHTML = "<h1>Built by a script</h1>"</script>',
  }
  server = createServer((request, response) => {
    const body = pages[request.url ?? '/']
    if (body === undefined) return response.writeHead(404).end()
    response.writeHead(200, { 'Content-Type': 'text/html' }).end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const quiet = () => undefined
const schema = {
  items: { selector: 'li', list: true, fields: { name: 'a', link: 'a@href' } },
  next: 'a.next@href',
} as const

describe('runTask', () => {
  const localSite = () =>
    defineSite({
      description: 'A local test site',
      baseUrl: `${origin}/`,
      minDelayMs: 10,
      tasks: {
        list: defineTask({
          description: 'Both list pages',
          async run({ fetch, baseUrl }) {
            const first = (await fetch(baseUrl)).extract(schema)
            const second = first.next ? (await fetch(first.next)).extract(schema) : { items: [] }
            return [...first.items, ...second.items]
          },
        }),
      },
    })

  it('runs a task and saves what it returns as JSON and CSV', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'scrapers-'))
    const { records, files } = await runTask(localSite(), 'list', { outputDir, csv: true, log: quiet })

    expect(records).toEqual([
      { name: 'One', link: `${origin}/item/1` },
      { name: 'Two', link: `${origin}/item/2` },
      { name: 'Three', link: `${origin}/item/3` },
    ])
    expect(files.map((file) => path.relative(outputDir, file))).toEqual([
      expect.stringMatching(/^list-[\dT-]+\.json$/),
      expect.stringMatching(/^list-[\dT-]+\.csv$/),
    ])
    expect(JSON.parse(await readFile(files[0] as string, 'utf8'))).toEqual(records)
  })

  it('says which tasks exist when asked for one that does not', async () => {
    await expect(runTask(localSite(), 'missing', { log: quiet })).rejects.toThrow(
      'There\'s no task "missing". The tasks: list',
    )
  })
})

const chrome = findChrome()

describe.skipIf(!chrome)('runTask in a browser', { timeout: 60_000 }, () => {
  beforeAll(() => {
    process.env.CHROME_PATH = chrome ?? ''
  })

  it('reads pages built by scripts', async () => {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'scrapers-'))
    const browserSite = defineSite({
      description: 'A local test site, in a browser',
      baseUrl: `${origin}/`,
      minDelayMs: 10,
      tasks: {
        pages: defineTask({
          description: 'A rendered page',
          async run({ open }) {
            const app = await open('app')
            return [await app.extract({ title: 'h1' })]
          },
        }),
      },
    })
    const { records } = await runTask(browserSite, 'pages', { outputDir, log: quiet })
    expect(records).toEqual([{ title: 'Built by a script' }])
  })
})
