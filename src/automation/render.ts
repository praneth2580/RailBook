/** Things to do in a rendered page before reading it, in order. Each one waits for the page to settle. */
export type PageAction =
  /** With times, keeps clicking while the element is there, e.g. a "Load more" button. */
  | { type: 'click'; selector: string; times?: number }
  | { type: 'type'; selector: string; text: string }
  | { type: 'press'; key: PressKey }
  /** Scrolls to the bottom, for pages that load more as you scroll. Stops early once nothing new loads. */
  | { type: 'scroll'; times: number }
  | { type: 'wait'; ms: number }
  | { type: 'waitFor'; selector: string }

export const PRESS_KEYS = ['Enter', 'Tab', 'Escape'] as const
export type PressKey = (typeof PRESS_KEYS)[number]

export interface RenderOptions {
  /** Wait until this CSS selector matches before reading the page. */
  waitFor?: string
  actions?: PageAction[]
  /** Keep the JSON responses the page requests whose address matches this pattern, where * matches anything. */
  capture?: string
}

export const MAX_ACTIONS = 20

/** Matches a whole address against a pattern where * stands for any run of characters. */
export function globToRegExp(pattern: string) {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}$`, 'i')
}

function text(value: unknown, name: string, { optional = false, max = 500 } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return undefined
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} needs a value.`)
  if (value.length > max) throw new Error(`${name} is too long.`)
  return value.trim()
}

function whole(value: unknown, name: string, min: number, max: number, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}.`)
  }
  return value
}

function parseAction(value: unknown, index: number): PageAction {
  if (typeof value !== 'object' || value === null) throw new Error(`Action ${index + 1} isn't valid.`)
  const action = value as Record<string, unknown>
  const name = `Action ${index + 1}`
  switch (action.type) {
    case 'click': {
      const selector = text(action.selector, `${name}'s selector`) as string
      const times = whole(action.times, `${name}'s repeat count`, 1, 50, 1)
      return times > 1 ? { type: 'click', selector, times } : { type: 'click', selector }
    }
    case 'type':
      return {
        type: 'type',
        selector: text(action.selector, `${name}'s selector`) as string,
        text: typeof action.text === 'string' && action.text.length <= 1000 ? action.text : '',
      }
    case 'press':
      if (!PRESS_KEYS.includes(action.key as PressKey)) throw new Error(`${name} presses a key RailBook doesn't know.`)
      return { type: 'press', key: action.key as PressKey }
    case 'scroll':
      return { type: 'scroll', times: whole(action.times, `${name}'s scroll count`, 1, 50) }
    case 'wait':
      return { type: 'wait', ms: whole(action.ms, `${name}'s wait`, 0, 30_000) }
    case 'waitFor':
      return { type: 'waitFor', selector: text(action.selector, `${name}'s selector`) as string }
    default:
      throw new Error(`${name} has an unknown type.`)
  }
}

/** Checks render options that arrive as JSON. Throws an Error that says what's wrong. */
export function parseRenderOptions(value: unknown): RenderOptions {
  if (value === true || value === undefined || value === null) return {}
  if (typeof value !== 'object') throw new Error('The loading options are not valid.')
  const options = value as Record<string, unknown>
  const result: RenderOptions = {}
  const waitFor = text(options.waitFor, 'Wait for', { optional: true })
  if (waitFor) result.waitFor = waitFor
  const capture = text(options.capture, 'The JSON capture pattern', { optional: true })
  if (capture) result.capture = capture
  if (options.actions !== undefined) {
    if (!Array.isArray(options.actions)) throw new Error('Actions must be a list.')
    if (options.actions.length > MAX_ACTIONS) throw new Error(`A page can have at most ${MAX_ACTIONS} actions.`)
    if (options.actions.length > 0) result.actions = options.actions.map(parseAction)
  }
  return result
}
