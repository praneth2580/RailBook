import { Link, NavLink } from 'react-router-dom'
import { journeyCollection, passengerCollection } from '../core/collections'
import { useSettings } from '../core/settings'
import { useCollection } from '../core/storage'
import type { Journey } from '../core/types'
import { useNow } from '../core/useNow'
import { byWindow, isActive, taskStatus } from '../features/tasks/tasks'
import { formatCountdown, journeyOpensAt } from '../features/tatkal/tatkalWindow'
import { Icon, type IconName } from './Icon'
import { Avatar, Keys } from './layout'
import { MOD_KEY } from './shortcuts'

export const NAV: { to: string; label: string; icon: IconName; key: string }[] = [
  { to: '/', label: 'Home', icon: 'home', key: '1' },
  { to: '/tasks', label: 'Booking tasks', icon: 'tasks', key: '2' },
  { to: '/passengers', label: 'Passengers', icon: 'users', key: '3' },
  { to: '/pnr', label: 'PNR status', icon: 'ticket', key: '4' },
  { to: '/practice', label: 'Practice', icon: 'timer', key: '5' },
]

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const { settings } = useSettings()
  const { items: journeys } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const now = useNow()

  const active = journeys.filter((journey) => isActive(taskStatus(journey, now))).sort(byWindow)
  const counts: Record<string, number> = { '/tasks': active.length, '/passengers': passengers.length }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">
          <Icon name="train" size={18} />
        </span>
        <strong className="nav-label">RailBook</strong>
      </div>

      <button type="button" className="sidebar-search" onClick={onSearch} title={`Search (${MOD_KEY}+K)`}>
        <Icon name="search" size={16} />
        <span className="nav-label">Search</span>
        <Keys keys={[MOD_KEY, 'K']} />
      </button>

      <Link to="/tasks/new" className="button sidebar-new" title="New booking task (N)">
        <Icon name="plus" size={18} />
        <span className="nav-label">New task</span>
      </Link>

      <nav className="sidebar-nav" aria-label="Main">
        {NAV.map(({ to, label, icon, key }) => (
          <NavLink key={to} to={to} end={to === '/'} title={`${label} (${key})`}>
            <Icon name={icon} size={18} />
            <span className="nav-label">{label}</span>
            {counts[to] ? <span className="nav-count">{counts[to]}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-spacer" />
      <NextWindow journey={active[0]} now={now} />

      <NavLink to="/settings" className="sidebar-profile" title={`Settings (${MOD_KEY}+,)`}>
        <Avatar id="profile" name={settings.profile.name || 'You'} size={28} />
        <span className="list-text nav-label">
          <strong>{settings.profile.name || 'Your profile'}</strong>
          <small>Settings</small>
        </span>
        <Icon name="settings" size={16} />
      </NavLink>
    </aside>
  )
}

/** Always in view, so the next window is never more than a glance away. */
function NextWindow({ journey, now }: { journey: Journey | undefined; now: number }) {
  if (!journey) {
    return (
      <Link to="/tasks/new" className="next-window empty" title="No booking windows coming up">
        <Icon name="clock" size={16} />
        <span className="nav-label">
          <small>No windows coming up</small>
          <strong>Plan a task</strong>
        </span>
      </Link>
    )
  }

  const open = taskStatus(journey, now) === 'open'
  return (
    <Link
      to={`/tasks/${journey.id}`}
      className={`next-window${open ? ' open' : ''}`}
      title={`${journey.from} to ${journey.to}`}
    >
      <Icon name="clock" size={16} />
      <span className="nav-label">
        <small>{open ? 'Window open' : 'Next window'}</small>
        <strong>
          {journey.from} → {journey.to}
        </strong>
        <span className="next-window-countdown">{formatCountdown(journeyOpensAt(journey).getTime() - now)}</span>
      </span>
    </Link>
  )
}
