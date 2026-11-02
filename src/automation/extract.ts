/**
 * A field is a CSS selector, read as the first match's text, or one of the objects below.
 * Schemas are plain data, so jobs that use them can be saved as JSON.
 */
export type Field = string | ValueField | ListField

export interface ValueField {
  /** Leave it out to read the current element itself, e.g. inside a list. */
  selector?: string
  /** Read this attribute instead of the text. href, src, action and poster come back as absolute URLs. */
  attr?: string
  /** Read every match into an array instead of only the first. */
  all?: boolean
}

export interface ListField {
  /** Selector for the repeating element. Its fields are read inside each match. */
  each: string
  fields: Fields
}

export interface Fields {
  [name: string]: Field
}

type FieldValue<F> = F extends string
  ? string | null
  : F extends { each: string; fields: infer Inner extends Fields }
    ? Extracted<Inner>[]
    : F extends { all: true }
      ? string[]
      : F extends { all?: false }
        ? string | null
        : string[] | string | null

/** Missing values are null; text has its whitespace collapsed. */
export type Extracted<F extends Fields> = { -readonly [K in keyof F]: FieldValue<F[K]> }

type Scope = Document | Element

const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'poster'])

export function parseHtml(html: string) {
  return new DOMParser().parseFromString(html, 'text/html')
}

/** The address relative links resolve against, which a <base> element can change. */
export function documentBaseUrl(document: Document, url: string) {
  const base = document.querySelector('base[href]')?.getAttribute('href')
  if (!base) return url
  try {
    return new URL(base, url).href
  } catch {
    return url
  }
}

// Selectors come from saved jobs, so name the bad one instead of throwing a bare DOMException.
function select(scope: Scope, selector: string) {
  try {
    return [...scope.querySelectorAll(selector)]
  } catch {
    throw new Error(`Invalid CSS selector: ${selector}`)
  }
}

function read(element: Element, attr: string | undefined, baseUrl: string) {
  if (!attr) return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  const value = element.getAttribute(attr)
  if (value === null || !URL_ATTRIBUTES.has(attr.toLowerCase())) return value
  try {
    return new URL(value.trim(), baseUrl).href
  } catch {
    return value
  }
}

function extractField(scope: Scope, field: Field, baseUrl: string): unknown {
  const spec = typeof field === 'string' ? { selector: field } : field
  if ('each' in spec) return select(scope, spec.each).map((element) => extract(element, spec.fields, baseUrl))

  const found = spec.selector ? select(scope, spec.selector) : ['documentElement' in scope ? scope.documentElement : scope]
  if (spec.all) return found.map((element) => read(element, spec.attr, baseUrl)).filter((value) => value !== null)
  return found[0] ? read(found[0], spec.attr, baseUrl) : null
}

export function extract<const F extends Fields>(scope: Scope, fields: F, baseUrl: string): Extracted<F> {
  return Object.fromEntries(
    Object.entries(fields).map(([name, field]) => [name, extractField(scope, field, baseUrl)]),
  ) as Extracted<F>
}
