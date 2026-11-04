import type { Wraith } from 'wraithjs'
import type { RecordedElement, SiteLogEntry } from '../../src/features/site/siteLog'

type BrowserContext = Awaited<ReturnType<Wraith['context']>>

const MAX_ENTRIES = 500
const BINDING = '__railbookRecord'

/**
 * Runs in every page and frame of the companion browser: reports each click and key press with the element it was
 * on. A click reports the link, button or field around what was clicked, which is what a selector should find. Keys
 * typed into a password field come through as '•', and no field's value is ever sent.
 */
const RECORDER = `(() => {
  if (window.__railbookRecorder) return
  window.__railbookRecorder = true
  const send = (entry) => { try { window.${BINDING}(entry) } catch {} }
  const clean = (text) => (text || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
  const ATTRIBUTES = ['name', 'type', 'placeholder', 'aria-label', 'title', 'role', 'href', 'for']
  const CLICKABLE = 'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], [onclick]'
  const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']

  const cssPath = (element) => {
    const parts = []
    for (let node = element; node && node.nodeType === 1 && node.localName !== 'html'; node = node.parentElement) {
      if (node.id && !/\\d{3,}/.test(node.id)) { parts.unshift('#' + CSS.escape(node.id)); break }
      const tag = node.localName
      const parent = node.parentElement
      const same = parent ? [...parent.children].filter((child) => child.localName === tag) : []
      parts.unshift(same.length > 1 ? tag + ':nth-of-type(' + (same.indexOf(node) + 1) + ')' : tag)
      if (tag === 'body') break
    }
    return parts.join(' > ')
  }

  const describe = (element) => {
    const tag = element.localName
    const field = tag === 'input' || tag === 'textarea' || tag === 'select'
    const attributes = {}
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name)
      if (value) attributes[name] = value.slice(0, 200)
    }
    return {
      tag,
      id: element.id || undefined,
      classes: [...element.classList].slice(0, 10),
      text: field ? undefined : clean(element.innerText || element.textContent) || undefined,
      attributes,
      css: cssPath(element),
    }
  }

  addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return
    send({ kind: 'click', url: location.href, element: describe(event.target.closest(CLICKABLE) || event.target) })
  }, true)

  addEventListener('keydown', (event) => {
    if (MODIFIERS.includes(event.key)) return
    const target = event.target instanceof Element ? event.target : null
    const secret = target && target.localName === 'input' && target.type === 'password'
    const key = secret && event.key.length === 1 ? '•' : event.key === ' ' ? 'Space' : event.key
    const held = [event.ctrlKey && 'Control', event.altKey && 'Alt', event.metaKey && 'Meta', event.shiftKey && key.length > 1 && 'Shift']
    send({ kind: 'press', url: location.href, key: [...held.filter(Boolean), key].join('+'), element: target ? describe(target) : undefined })
  }, true)
})()`

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : undefined)

/** What a page sent, checked: the page's own scripts can call the binding too. */
function parseEntry(value: unknown): Pick<SiteLogEntry, 'kind' | 'url' | 'key' | 'element'> | null {
  if (typeof value !== 'object' || value === null) return null
  const entry = value as Record<string, unknown>
  if (entry.kind !== 'click' && entry.kind !== 'press') return null
  const raw = (typeof entry.element === 'object' && entry.element !== null ? entry.element : null) as Record<
    string,
    unknown
  > | null
  const element: RecordedElement | undefined = raw
    ? {
        tag: text(raw.tag, 40) ?? '?',
        id: text(raw.id, 200) || undefined,
        classes: Array.isArray(raw.classes) ? raw.classes.slice(0, 10).map((name) => String(name).slice(0, 100)) : [],
        text: text(raw.text, 120) || undefined,
        attributes: Object.fromEntries(
          Object.entries(typeof raw.attributes === 'object' && raw.attributes !== null ? raw.attributes : {})
            .slice(0, 10)
            .map(([name, item]) => [name.slice(0, 40), String(item).slice(0, 200)]),
        ),
        css: text(raw.css, 1000) ?? '',
      }
    : undefined
  return { kind: entry.kind, url: text(entry.url, 2000) ?? '', key: text(entry.key, 60), element }
}

/**
 * Logs every click and key press on the companion page, and every address it moves to, for SitePage under npm run
 * dev. Entries made while RailBook's own actions run are marked as the helper's; the rest are the person's.
 */
export function createSiteRecorder() {
  let entries: SiteLogEntry[] = []
  let nextId = 1
  let acting = 0
  const attached = new WeakSet<BrowserContext>()

  const push = (entry: Pick<SiteLogEntry, 'kind' | 'url' | 'key' | 'element'>) => {
    entries.push({ id: nextId++, at: Date.now(), by: acting > 0 ? 'helper' : 'you', ...entry })
    if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
  }

  return {
    /** Starts recording in every page this browser context opens. Does nothing the second time. */
    async attach(context: BrowserContext) {
      if (attached.has(context)) return
      attached.add(context)
      await context.exposeBinding(BINDING, (_source, value: unknown) => {
        const entry = parseEntry(value)
        if (entry) push(entry)
      })
      await context.addInitScript(RECORDER)
      context.on('page', (page) =>
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) push({ kind: 'page', url: frame.url() })
        }),
      )
    },
    /** Runs one of RailBook's own actions, so what it does is logged as the helper's. */
    async asHelper<T>(run: () => Promise<T>): Promise<T> {
      acting += 1
      try {
        return await run()
      } finally {
        acting -= 1
      }
    },
    /** Entries after the one with this id, oldest first. */
    since(after: number) {
      return entries.filter((entry) => entry.id > after)
    },
    clear() {
      entries = []
    },
  }
}

export type SiteRecorder = ReturnType<typeof createSiteRecorder>
