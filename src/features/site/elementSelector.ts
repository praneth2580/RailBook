import type { ValueField } from '../../automation/fields'

/**
 * One element on the site, described in parts rather than as one selector string. selectors.ts lists them, and
 * actionSelector and readField turn one into what clicking and reading need.
 *
 * Every part given has to match. Describe the element with tag, id, classes, attributes and text, or give the whole
 * of it as css or xpath when the parts can't say it. css and xpath don't combine with tag, id, classes or attributes.
 */
export interface ElementSelector {
  /** A whole CSS selector, such as 'app-header > div:nth-of-type(2) > a'. */
  css?: string
  /**
   * A whole XPath, such as '/html/body/app-root/div[1]/a'. For clicking and typing only, since reading a page needs
   * CSS, and it doesn't combine with text.
   */
  xpath?: string
  /** The element's tag, such as 'button', 'a' or 'input'. */
  tag?: string
  /** Its id, without the '#'. */
  id?: string
  /** Classes it has, without dots. It needs all of them, and can have more. */
  classes?: readonly string[]
  /** Attributes it has, with these values: { placeholder: 'From*', 'aria-label': 'Menu' }. */
  attributes?: Readonly<Record<string, string>>
  /**
   * Its visible text, such as a button's label. Clicking finds the element whose text contains it, ignoring case;
   * reading needs the whole text, ignoring case and extra spaces.
   */
  text?: string
  /** Clicking needs the whole text, with its case. */
  exactText?: boolean
  /** Only look inside this element. */
  within?: ElementSelector
  /** Which match to use when several do, from 0. For clicking and typing only. */
  nth?: number
}

const PARTS = ['tag', 'id', 'classes', 'attributes'] as const

/** Throws when the parts given can't describe one element. */
function check(element: ElementSelector) {
  const parts = PARTS.filter((part) => element[part] !== undefined)
  if (element.css !== undefined && element.xpath !== undefined) throw new Error('Give css or xpath, not both.')
  const whole = element.css !== undefined ? 'css' : element.xpath !== undefined ? 'xpath' : null
  if (whole && parts.length > 0) throw new Error(`${whole} doesn't combine with ${parts.join(', ')}.`)
  if (whole === 'xpath' && element.text !== undefined) throw new Error("xpath doesn't combine with text.")
  if (!whole && parts.length === 0 && element.text === undefined) {
    throw new Error('Describe the element with css, xpath, tag, id, classes, attributes or text.')
  }
}

/** Escapes an id, class or attribute name for CSS. */
function ident(value: string) {
  // Special characters first, then a leading digit, so neither escape gets escaped again.
  return value.replace(/[^\w-]/g, (character) => `\\${character}`).replace(/^\d/, (digit) => `\\3${digit} `)
}

/** The element itself as CSS, without its text or what it's within. Empty when only text describes it. */
function ownCss(element: ElementSelector) {
  // A list such as 'a, button' goes in :is(), so what's added after it applies to every item.
  if (element.css !== undefined) return element.css.includes(',') ? `:is(${element.css})` : element.css
  return [
    element.tag ?? '',
    element.id !== undefined ? `#${ident(element.id)}` : '',
    ...(element.classes ?? []).map((name) => `.${ident(name)}`),
    ...Object.entries(element.attributes ?? {}).map(([name, value]) => `[${ident(name)}=${JSON.stringify(value)}]`),
  ].join('')
}

/**
 * The selector to click, type into or wait for, as site.act's actions take it. Playwright reads it in the browser,
 * so xpath, text and nth all work here.
 */
export function actionSelector(element: ElementSelector): string {
  check(element)
  let selector: string
  if (element.xpath !== undefined) {
    selector = `xpath=${element.xpath}`
  } else {
    const css = ownCss(element)
    const { text, exactText } = element
    if (text === undefined) selector = css
    else if (css) selector = `${css}:${exactText ? 'text-is' : 'has-text'}(${JSON.stringify(text)})`
    // Text alone finds the smallest element with it, rather than every element around it too.
    else selector = exactText ? `text=${JSON.stringify(text)}` : `text=/${text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/i`
  }
  if (element.within) selector = `${actionSelector(element.within)} >> ${selector}`
  if (element.nth !== undefined) selector += ` >> nth=${element.nth}`
  return selector
}

/** The CSS for an element to read, with what it's within in front. */
function readCss(element: ElementSelector): string {
  check(element)
  if (element.xpath !== undefined) throw new Error('Reading a page needs CSS, so describe the element without xpath.')
  if (element.nth !== undefined) throw new Error('Reading a page has no nth. Use list: true and pick from the list.')
  const own = ownCss(element)
  if (!element.within) return own
  if (element.within.text !== undefined) throw new Error("Reading a page can't look within an element found by its text.")
  return `${readCss(element.within)} ${own || '*'}`
}

/**
 * A field that reads the element with site.extract, or a page's extract in scrapers/. Options such as attr, list and
 * default go in the second argument: readField(LIST.link, { attr: 'href' }).
 */
export function readField(element: ElementSelector, options: Omit<ValueField, 'selector' | 'text' | 'near'> = {}) {
  const selector = readCss(element)
  const field: ValueField = { ...options }
  if (selector) field.selector = selector
  if (element.text !== undefined) field.text = element.text
  return field
}
