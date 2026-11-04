import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function cell(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = Array.isArray(value)
    ? value.join('; ')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Columns are every field any record has, in the order they first appear. */
export function toCsv(records: Record<string, unknown>[]) {
  const columns = [...new Set(records.flatMap((record) => Object.keys(record)))]
  const lines = [
    columns.map(cell).join(','),
    ...records.map((record) => columns.map((column) => cell(record[column])).join(',')),
  ]
  // The byte-order mark makes Excel read the file as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Saves records as output/<task>-<time>.json, and .csv too when asked. Returns the files written. */
export async function saveResults(
  outputDir: string,
  task: string,
  records: Record<string, unknown>[],
  { csv = false, now = new Date() }: { csv?: boolean; now?: Date } = {},
) {
  await mkdir(outputDir, { recursive: true })
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const base = path.join(outputDir, `${task}-${stamp}`)
  const files = [`${base}.json`]
  await writeFile(files[0] as string, `${JSON.stringify(records, null, 2)}\n`)
  if (csv) {
    files.push(`${base}.csv`)
    await writeFile(`${base}.csv`, toCsv(records))
  }
  return files
}
