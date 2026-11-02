import { useState, type FormEvent } from 'react'
import { pnrCollection } from '../../core/collections'
import { formatPnr, formatSavedDate } from '../../core/format'
import { useCollection } from '../../core/storage'
import type { SavedPnr } from '../../core/types'
import { copyText } from '../../platform/clipboard'
import { openOfficialPage } from '../../platform/officialPages'
import { Icon } from '../../ui/Icon'
import { ConfirmSheet, EmptyState, PageHeader } from '../../ui/layout'
import { extractPnr } from './extractPnr'

export function PnrPage() {
  const { items: pnrs, loaded, save, remove } = useCollection(pnrCollection)
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<SavedPnr | null>(null)

  const addPnr = async (event: FormEvent) => {
    event.preventDefault()
    const pnr = extractPnr(text)
    if (!pnr) {
      setError('No PNR found. Paste the booking SMS or the 10-digit number.')
      return
    }
    await save({ id: crypto.randomUUID(), pnr, note: note.trim(), savedAt: new Date().toISOString() })
    setText('')
    setNote('')
    setError('')
  }

  const sorted = [...pnrs].sort((a, b) => b.savedAt.localeCompare(a.savedAt))

  return (
    <>
      <PageHeader title="PNR status" subtitle="Saved tickets and quick status checks" />

      <form className="card stack" onSubmit={addPnr}>
        <label className="field">
          <span>Booking SMS or PNR</span>
          <textarea
            required
            rows={3}
            placeholder="Paste the SMS. RailBook finds the PNR in it."
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="field">
          <span>
            Note <em>Optional</em>
          </span>
          <input placeholder="e.g. Diwali trip home" value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        {error && <small className="error">{error}</small>}
        <button type="submit" className="button">
          <Icon name="plus" />
          Save PNR
        </button>
      </form>

      {loaded && pnrs.length === 0 ? (
        <EmptyState icon="ticket" title="No saved PNRs">
          PNRs from finished booking sessions land here automatically.
        </EmptyState>
      ) : (
        <>
          <ul className="list">
            {sorted.map((item) => (
              <TicketCard key={item.id} item={item} onRemove={() => setRemoving(item)} />
            ))}
          </ul>
          <small className="muted center">Check status copies the PNR and opens the official enquiry page.</small>
        </>
      )}

      <ConfirmSheet
        open={removing !== null}
        title="Remove this PNR?"
        body={removing ? `${formatPnr(removing.pnr)} will be removed from this phone. The ticket itself isn't affected.` : ''}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (removing) await remove(removing.id)
          setRemoving(null)
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}

function TicketCard({ item, onRemove }: { item: SavedPnr; onRemove: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await copyText(item.pnr)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const checkStatus = async () => {
    await copyText(item.pnr)
    await openOfficialPage('pnr')
  }

  return (
    <li className="ticket">
      <div className="ticket-main">
        <small className="muted">PNR</small>
        <strong className="ticket-pnr">{formatPnr(item.pnr)}</strong>
        {item.note && <span>{item.note}</span>}
        <small className="muted">Saved {formatSavedDate(item.savedAt)}</small>
      </div>
      <div className="ticket-actions">
        <button type="button" className="button small" onClick={checkStatus}>
          <Icon name="external" size={16} />
          Check status
        </button>
        <button type="button" className="icon-button" aria-label={copied ? 'Copied' : 'Copy PNR'} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} />
        </button>
        <button type="button" className="icon-button" aria-label="Remove PNR" onClick={onRemove}>
          <Icon name="trash" />
        </button>
      </div>
    </li>
  )
}
