import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { journeyCollection, passengerCollection } from '../core/collections'
import { formatJourneyDate } from '../core/format'
import { useSettings } from '../core/settings'
import { useCollection } from '../core/storage'
import type { Theme } from '../core/types'
import { describePassenger } from '../features/passengers/PassengerDialog'
import { Icon, type IconName } from './Icon'
import { Keys } from './layout'
import { MOD_KEY } from './shortcuts'
import { NAV } from './Sidebar'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: IconName
  keys?: string[]
  /** Extra words to match, such as a train number. */
  keywords?: string
  run: () => void
}

const THEME_COMMANDS: { theme: Theme; label: string; icon: IconName }[] = [
  { theme: 'light', label: 'Use the light theme', icon: 'sun' },
  { theme: 'dark', label: 'Use the dark theme', icon: 'moon' },
  { theme: 'system', label: "Match the computer's theme", icon: 'monitor' },
]

function matches(command: Command, query: string) {
  const text = `${command.label} ${command.hint ?? ''} ${command.keywords ?? ''} ${command.group}`.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

/** Ctrl+K: jump to any screen, task or passenger, or run an action, from the keyboard. */
export function CommandPalette({
  open,
  onClose,
  onShowShortcuts,
}: {
  open: boolean
  onClose: () => void
  onShowShortcuts: () => void
}) {
  const navigate = useNavigate()
  const { update } = useSettings()
  const { items: journeys } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) {
      setQuery('')
      setSelected(0)
      element.showModal()
    }
    if (!open && element.open) element.close()
  }, [open])

  const go = (to: string, state?: object) => () => navigate(to, { state })
  const commands: Command[] = [
    { id: 'new-task', group: 'Actions', label: 'New booking task', icon: 'plus', keys: ['N'], run: go('/tasks/new') },
    {
      id: 'add-passenger',
      group: 'Actions',
      label: 'Add a passenger',
      icon: 'users',
      run: go('/passengers', { edit: 'new' }),
    },
    { id: 'save-pnr', group: 'Actions', label: 'Save a PNR', icon: 'ticket', run: go('/pnr', { focus: true }) },
    {
      id: 'shortcuts',
      group: 'Actions',
      label: 'Keyboard shortcuts',
      icon: 'keyboard',
      keys: ['?'],
      run: onShowShortcuts,
    },
    ...NAV.map(({ to, label, icon, key }) => ({
      id: `go:${to}`,
      group: 'Go to',
      label,
      icon,
      keys: [key],
      run: go(to),
    })),
    {
      id: 'go:/settings',
      group: 'Go to',
      label: 'Settings',
      icon: 'settings',
      keys: [MOD_KEY, ','],
      run: go('/settings'),
    },
    ...THEME_COMMANDS.map(({ theme, label, icon }) => ({
      id: `theme:${theme}`,
      group: 'Appearance',
      label,
      icon,
      run: () => void update({ theme }),
    })),
    ...[...journeys]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((journey) => ({
        id: `task:${journey.id}`,
        group: 'Booking tasks',
        label: `${journey.from} → ${journey.to}`,
        hint: `${journey.trainNumber} · ${journey.travelClass} · ${formatJourneyDate(journey.date)}`,
        icon: 'train' as const,
        keywords: `${journey.backupTrainNumber} ${journey.boardingStation} ${journey.quota ?? ''}`,
        run: go(`/tasks/${journey.id}`),
      })),
    ...passengers.map((passenger) => ({
      id: `passenger:${passenger.id}`,
      group: 'Passengers',
      label: passenger.name,
      hint: describePassenger(passenger),
      icon: 'user' as const,
      run: go('/passengers', { edit: passenger.id }),
    })),
  ]
  const results = query.trim() ? commands.filter((command) => matches(command, query.trim())) : commands
  const current = Math.min(selected, results.length - 1)

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <dialog
      ref={dialog}
      className="palette"
      aria-label="Search and commands"
      onClose={onClose}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      {open && (
        <div className="palette-body">
          <label className="palette-input">
            <Icon name="search" size={18} />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-results"
              aria-activedescendant={results[current] ? `palette-${results[current].id}` : undefined}
              placeholder="Search tasks, passengers and actions"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelected(0)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  setSelected((current + step + results.length) % Math.max(results.length, 1))
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  run(results[current])
                }
              }}
            />
            <kbd>Esc</kbd>
          </label>

          {results.length === 0 ? (
            <p className="palette-empty muted">Nothing matches “{query}”.</p>
          ) : (
            <ul ref={list} id="palette-results" className="palette-results" role="listbox">
              {results.map((command, index) => (
                <li
                  key={command.id}
                  id={`palette-${command.id}`}
                  role="option"
                  aria-selected={index === current}
                  data-group={index === 0 || results[index - 1]?.group !== command.group ? command.group : undefined}
                  onMouseMove={() => index !== current && setSelected(index)}
                  onClick={() => run(command)}
                >
                  <Icon name={command.icon} size={16} />
                  <span className="palette-label">{command.label}</span>
                  {command.hint && <small className="muted">{command.hint}</small>}
                  {command.keys && <Keys keys={command.keys} />}
                </li>
              ))}
            </ul>
          )}
          <footer className="palette-footer muted">
            <span>
              <Keys keys={['↑', '↓']} /> to move
            </span>
            <span>
              <Keys keys={['Enter']} /> to open
            </span>
          </footer>
        </div>
      )}
    </dialog>
  )
}
