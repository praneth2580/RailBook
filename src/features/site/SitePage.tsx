import { useEffect, useRef, useState } from 'react'
import { copyText } from '../../platform/clipboard'
import { clearSiteLog, getSiteLog } from '../../platform/site'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader, Panel, StatusChip } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { RUN_BY_HAND } from './runByHand'
import { describeElement, formatSelector, suggestSelector, type SiteLogEntry } from './siteLog'
import { useSite } from './SiteProvider'

const POLL_MS = 1000
const KEEP = 500

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

/** The launcher's log of clicks and key presses on the companion page, fetched every second while this page is open. */
function useSiteLog(enabled: boolean) {
  const [entries, setEntries] = useState<SiteLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const last = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const { entries: next } = await getSiteLog(last.current)
        if (stopped) return
        const newest = next.at(-1)
        if (newest) {
          last.current = newest.id
          setEntries((current) => [...current, ...next].slice(-KEEP))
        }
        setError(null)
      } catch (caught) {
        if (stopped) return
        setError(caught instanceof Error ? caught.message : String(caught))
      }
      timer = window.setTimeout(() => void poll(), POLL_MS)
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [enabled])

  const clear = async () => {
    await clearSiteLog()
    setEntries([])
  }
  return { entries, error, clear }
}

function LogEntry({ entry }: { entry: SiteLogEntry }) {
  const toast = useToast()
  const { element } = entry
  const suggestion = element && formatSelector(suggestSelector(element))
  const what = entry.kind === 'click' ? 'Click' : entry.kind === 'press' ? `Press ${entry.key ?? ''}` : 'Page'

  return (
    <li>
      <span className="mono muted">{timeFormat.format(entry.at)}</span>
      <StatusChip tone={entry.by === 'helper' ? 'info' : 'muted'}>{entry.by === 'helper' ? 'Helper' : 'You'}</StatusChip>
      <span className="list-text">
        <strong>
          {what}
          {element && (
            <>
              {' on '}
              <span className="mono">{describeElement(element)}</span>
            </>
          )}
        </strong>
        {element ? (
          <>
            <small className="mono">{suggestion}</small>
            <small className="mono muted">{element.css}</small>
          </>
        ) : (
          <small className="mono">{entry.url}</small>
        )}
      </span>
      {suggestion && (
        <button
          type="button"
          className="button secondary small"
          title="Copy this selector, to paste into selectors.ts"
          onClick={() => void copyText(suggestion).then(() => toast('Selector copied. Paste it into selectors.ts.'))}
        >
          <Icon name="copy" size={16} />
          Copy
        </button>
      )}
    </li>
  )
}

/**
 * Under npm run dev: runs the site helpers on the live companion page, and logs every click and key press on it,
 * whether a helper or the person in the window made it, with a selector for each element to paste into selectors.ts.
 */
export function SitePage() {
  const site = useSite()
  const toast = useToast()
  const [running, setRunning] = useState<string | null>(null)
  const log = useSiteLog(site.status === 'ready')

  const run = async (name: string, helper: (typeof RUN_BY_HAND)[number]['run']) => {
    setRunning(name)
    try {
      const result = await helper(site)
      toast(result === undefined ? `${name}: done` : `${name}: done, it returned ${JSON.stringify(result)}`)
    } catch (error) {
      console.error(`${name}:`, error)
      toast(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setRunning(null)
    }
  }

  const header = (
    <PageHeader
      title="Companion site"
      subtitle={site.info ? `${site.info.title || 'Untitled'} · ${site.info.url}` : 'Development only'}
      actions={
        site.status === 'ready' && (
          <button type="button" className="button secondary" onClick={() => void site.refresh()}>
            <Icon name="refresh" size={16} />
            Refresh
          </button>
        )
      }
    />
  )

  if (site.status !== 'ready') {
    return (
      <>
        {header}
        <EmptyState icon="monitor" title={site.status === 'off' ? 'No companion website' : 'Opening the companion website…'}>
          {site.status === 'off' && 'Set RAILBOOK_SITE_URL in .env.local, then restart npm run dev.'}
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {header}
      <div className="stack">
        <Panel
          title="Site helpers"
          description="Run one on the live page. Add more in src/features/site/runByHand.ts. To watch, turn on Show the scraping browser in Settings › Developer."
        >
          {RUN_BY_HAND.map(({ name, run: helper }) => (
            <div key={name} className="setting-row">
              <span className="list-text">
                <strong>{name}</strong>
                <small className="mono">{helper.name}</small>
              </span>
              <button
                type="button"
                className="button secondary small"
                disabled={running !== null}
                onClick={() => void run(name, helper)}
              >
                <Icon name="play" size={16} />
                {running === name ? 'Running…' : 'Run'}
              </button>
            </div>
          ))}
        </Panel>

        <Panel
          title="Clicks and key presses"
          description="Everything on the companion page, newest first: the helpers' actions and yours in its window. Keys typed into password fields show as •, and nothing is saved."
          actions={
            <button
              type="button"
              className="button secondary small"
              disabled={log.entries.length === 0}
              onClick={() => void log.clear().catch((error: unknown) => toast(String(error)))}
            >
              <Icon name="trash" size={16} />
              Clear
            </button>
          }
        >
          {log.error && <p className="muted">Couldn't read the log: {log.error}</p>}
          {log.entries.length === 0 ? (
            <p className="muted">Nothing yet. Click or type in the companion window, or run a helper.</p>
          ) : (
            <ul className="plain-list site-log">
              {[...log.entries].reverse().map((entry) => (
                <LogEntry key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
