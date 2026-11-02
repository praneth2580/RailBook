import { Link } from 'react-router-dom'
import { journeyCollection, passengerCollection, pnrCollection } from '../../core/collections'
import { formatPnr, formatSavedDate, greeting } from '../../core/format'
import { useSettings } from '../../core/settings'
import { useCollection } from '../../core/storage'
import { useNow } from '../../core/useNow'
import { Icon, type IconName } from '../../ui/Icon'
import { EmptyState, SectionHead } from '../../ui/layout'
import { TaskCard } from '../tasks/TaskCard'
import { WindowHero } from '../tasks/TaskParts'
import { byWindow, isActive, taskStatus } from '../tasks/tasks'

const QUICK_ACTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/tasks/new', label: 'New task', icon: 'plus' },
  { to: '/passengers', label: 'Passengers', icon: 'users' },
  { to: '/pnr', label: 'PNR status', icon: 'ticket' },
  { to: '/practice', label: 'Practice', icon: 'timer' },
]

export function HomePage() {
  const { settings } = useSettings()
  const { items: journeys, loaded } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const { items: pnrs } = useCollection(pnrCollection)
  const now = useNow()

  const active = journeys.filter((journey) => isActive(taskStatus(journey, now))).sort(byWindow)
  const [next, ...later] = active
  const booked = journeys.filter((journey) => journey.outcome?.result === 'booked').length
  const recentPnrs = [...pnrs].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 2)
  const firstName = settings.profile.name.split(' ')[0]

  return (
    <>
      <header className="home-header">
        <div>
          <small className="muted">
            {greeting(now)}
            {firstName && `, ${firstName}`}
          </small>
          <h1>RailBook</h1>
        </div>
        <Link to="/settings" className="icon-button" aria-label="Settings">
          <Icon name="user" />
        </Link>
      </header>

      {next ? (
        <WindowHero journey={next} now={now} label="Next booking window" />
      ) : (
        loaded && (
          <EmptyState
            icon="train"
            title="No booking tasks yet"
            action={
              <Link className="button" to="/tasks/new">
                <Icon name="plus" />
                New booking task
              </Link>
            }
          >
            Plan a task and RailBook counts down to its window, checks you're ready and keeps every detail a click
            away.
          </EmptyState>
        )
      )}

      <nav className="quick-actions" aria-label="Quick actions">
        {QUICK_ACTIONS.map(({ to, label, icon }) => (
          <Link key={to} to={to}>
            <span className="quick-icon">
              <Icon name={icon} />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <section className="stats" aria-label="Summary">
        <div>
          <strong>{active.length}</strong>
          <small>Active tasks</small>
        </div>
        <div>
          <strong>{booked}</strong>
          <small>Booked</small>
        </div>
        <div>
          <strong>{passengers.length}</strong>
          <small>Passengers</small>
        </div>
      </section>

      {later.length > 0 && (
        <section className="stack">
          <SectionHead title="Up next" action={<Link to="/tasks">See all</Link>} />
          <ul className="list">
            {later.slice(0, 3).map((journey) => (
              <li key={journey.id}>
                <TaskCard journey={journey} now={now} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentPnrs.length > 0 && (
        <section className="stack">
          <SectionHead title="Recent PNRs" action={<Link to="/pnr">See all</Link>} />
          <ul className="list">
            {recentPnrs.map(({ id, pnr, note, savedAt }) => (
              <li key={id}>
                <Link to="/pnr" className="list-row">
                  <span className="option-icon">
                    <Icon name="ticket" />
                  </span>
                  <span className="list-text">
                    <strong className="mono">{formatPnr(pnr)}</strong>
                    <small>{note || `Saved ${formatSavedDate(savedAt)}`}</small>
                  </span>
                  <Icon name="chevron" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
