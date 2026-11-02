import { useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { pnrCollection } from '../../core/collections'
import { formatPnr, formatSavedDate } from '../../core/format'
import { useCollection } from '../../core/storage'
import type { SavedPnr } from '../../core/types'
import { copyText } from '../../platform/clipboard'
import { openOfficialPage } from '../../platform/officialPages'
import { SearchField } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader, Panel } from '../../ui/layout'
import { MOD_KEY } from '../../ui/shortcuts'
import { useToast } from '../../ui/toast'
import { extractPnr } from './extractPnr'

export function PnrPage() {
  const { items: pnrs, loaded, save, remove } = useCollection(pnrCollection)
  const location = useLocation()
  const toast = useToast()
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const found = extractPnr(text)

  const addPnr = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!found) {
      setError('No PNR found. Paste the booking SMS or the 10-digit number.')
      return
    }
    await save({ id: crypto.randomUUID(), pnr: found, note: note.trim(), savedAt: new Date().toISOString() })
    toast(`Saved PNR ${formatPnr(found)}`)
    setText('')
    setNote('')
    setError('')
  }

  const removePnr = async (item: SavedPnr) => {
    await remove(item.id)
    toast(`Removed PNR ${formatPnr(item.pnr)}`, { label: 'Undo', run: () => void save(item) })
  }

  const words = query.trim().toLowerCase()
  const shown = [...pnrs]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .filter(({ pnr, note: itemNote }) => `${pnr} ${formatPnr(pnr)} ${itemNote}`.toLowerCase().includes(words))

  return (
    <>
      <PageHeader title="PNR status" subtitle="Saved tickets, and a quick way to check where they stand" />

      <div className="split">
        <Panel
          title="Add a PNR"
          description="Paste the booking SMS. RailBook finds the PNR in it."
          className="split-side"
        >
          <form className="stack" onSubmit={addPnr}>
            <label className="field">
              <span>Booking SMS or PNR</span>
              <textarea
                rows={5}
                autoFocus={Boolean((location.state as { focus?: boolean } | null)?.focus)}
                placeholder="PNR:1234567890, TRAIN:12952, DOJ:15-12-26…"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void addPnr()
                }}
              />
            </label>
            <div className={`detected${found ? ' found' : ''}`} aria-live="polite">
              <Icon name={found ? 'checkCircle' : 'search'} size={16} />
              {found ? (
                <span>
                  Found PNR <strong className="mono">{formatPnr(found)}</strong>
                </span>
              ) : (
                <span>{text ? 'No PNR in this text yet' : 'The PNR shows here once RailBook finds it'}</span>
              )}
            </div>
            <label className="field">
              <span>
                Note <em>Optional</em>
              </span>
              <input
                placeholder="e.g. Diwali trip home"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            {error && <small className="error">{error}</small>}
            <button type="submit" className="button">
              <Icon name="plus" size={18} />
              Save PNR
            </button>
            <small className="muted center">or press {MOD_KEY}+Enter in the text box</small>
          </form>
        </Panel>

        <div className="split-main">
          {loaded && pnrs.length === 0 ? (
            <EmptyState icon="ticket" title="No saved PNRs">
              PNRs from finished booking sessions land here automatically.
            </EmptyState>
          ) : (
            <>
              <div className="toolbar plain">
                <SearchField
                  label="Search PNRs"
                  placeholder="Search PNRs and notes"
                  value={query}
                  onChange={setQuery}
                />
                <small className="muted">
                  Check status copies the PNR and opens the official enquiry page in your browser.
                </small>
              </div>
              {shown.length === 0 ? (
                <p className="table-empty muted">No PNRs match “{query}”.</p>
              ) : (
                <ul className="ticket-grid">
                  {shown.map((item) => (
                    <TicketCard key={item.id} item={item} onRemove={() => removePnr(item)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function TicketCard({ item, onRemove }: { item: SavedPnr; onRemove: () => void }) {
  const [copied, setCopied] = useState(false)
  const toast = useToast()

  const copy = async () => {
    await copyText(item.pnr)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const checkStatus = async () => {
    await copyText(item.pnr)
    await openOfficialPage('pnr')
    toast('PNR copied. Paste it on the enquiry page in your browser.')
  }

  return (
    <li className="ticket">
      <div className="ticket-main">
        <small className="muted">PNR</small>
        <strong className="ticket-pnr mono">{formatPnr(item.pnr)}</strong>
        <span className="ticket-note">{item.note || 'No note'}</span>
        <small className="muted">Saved {formatSavedDate(item.savedAt)}</small>
      </div>
      <div className="ticket-actions">
        <button type="button" className="button small" onClick={checkStatus}>
          <Icon name="external" size={16} />
          Check status
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={copied ? 'Copied' : 'Copy PNR'}
          title="Copy PNR"
          onClick={copy}
        >
          <Icon name={copied ? 'check' : 'copy'} size={16} />
        </button>
        <button type="button" className="icon-button" aria-label="Remove PNR" title="Remove PNR" onClick={onRemove}>
          <Icon name="trash" size={16} />
        </button>
      </div>
    </li>
  )
}
