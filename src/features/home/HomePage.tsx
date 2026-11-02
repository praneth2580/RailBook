import { Link } from 'react-router-dom'
import { journeyCollection, passengerCollection, pnrCollection } from '../../core/collections'
import { formatDuration, formatJourneyDate, formatPnr, formatSavedDate, greeting, todayIso } from '../../core/format'
import { useSettings } from '../../core/settings'
import { useCollection } from '../../core/storage'
import { useNow } from '../../core/useNow'
import { Icon, type IconName } from '../../ui/Icon'
import { Keys, PageHeader, Panel } from '../../ui/layout'
import { MOD_KEY } from '../../ui/shortcuts'
import { TaskTable, WindowHero } from '../tasks/TaskParts'
import { byWindow, isActive, taskStatus } from '../tasks/tasks'

export function HomePage({ onSearch }: { onSearch: () => void }) {
  const { settings } = useSettings()
  const { items: journeys, loaded } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const { items: pnrs } = useCollection(pnrCollection)
  const now = useNow()

  const active = journeys.filter((journey) => isActive(taskStatus(journey, now))).sort(byWindow)
  const [next, ...later] = active
  const booked = journeys.filter((journey) => journey.outcome?.result === 'booked').length
  const recentPnrs = [...pnrs].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 4)
  const firstName = settings.profile.name.split(' ')[0]

  const setup: { done: boolean; title: string; body: string; to: string; state?: object; icon: IconName }[] = [
    {
      done: Boolean(settings.profile.irctcUsername),
      title: 'Add your IRCTC username',
      body: 'It goes in the copy panel. RailBook never asks for your password.',
      to: '/settings',
      icon: 'user',
    },
    {
      done: passengers.length > 0,
      title: 'Save your passengers',
      body: 'Once, with names as on their ID.',
      to: '/passengers',
      state: { edit: 'new' },
      icon: 'users',
    },
    {
      done: journeys.length > 0,
      title: 'Plan a booking task',
      body: 'RailBook works out when its window opens.',
      to: '/tasks/new',
      icon: 'tasks',
    },
    {
      done: settings.practiceBestSeconds !== null,
      title: 'Do a practice run',
      body: 'Rehearse the steps against the clock.',
      to: '/practice',
      icon: 'timer',
    },
  ]
  const setupLeft = setup.filter(({ done }) => !done).length

  const stats: { label: string; value: string | number; to: string }[] = [
    { label: 'Active tasks', value: active.length, to: '/tasks' },
    { label: 'Booked', value: booked, to: '/tasks' },
    { label: 'Passengers', value: passengers.length, to: '/passengers' },
    {
      label: 'Best practice',
      value: settings.practiceBestSeconds === null ? '–' : formatDuration(settings.practiceBestSeconds),
      to: '/practice',
    },
  ]

  return (
    <>
      <PageHeader
        windowTitle="Home"
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ''}`}
        subtitle={`${formatJourneyDate(todayIso(now))} · ${
          active.length === 0
            ? 'No booking windows coming up'
            : `${active.length} booking ${active.length === 1 ? 'window' : 'windows'} coming up`
        }`}
        actions={
          <>
            <button type="button" className="button secondary" onClick={onSearch}>
              <Icon name="search" size={16} />
              Search
              <Keys keys={[MOD_KEY, 'K']} />
            </button>
            <Link className="button" to="/tasks/new" title="New booking task (N)">
              <Icon name="plus" size={18} />
              New task
            </Link>
          </>
        }
      />

      <div className="dashboard">
        <div className="dashboard-main">
          {next ? (
            <WindowHero
              journey={next}
              now={now}
              label="Next booking window"
              actions={
                <>
                  <Link className="button hero-secondary" to={`/tasks/${next.id}`}>
                    View task
                  </Link>
                  <Link className="button hero-button" to={`/tasks/${next.id}/run`}>
                    <Icon name="play" size={18} />
                    Start booking session
                  </Link>
                </>
              }
            />
          ) : (
            loaded && (
              <section className="hero idle">
                <div className="hero-main">
                  <span className="hero-label">Next booking window</span>
                  <strong className="hero-title">Nothing scheduled yet</strong>
                  <small>
                    Plan a task and RailBook counts down to its window, checks you're ready and keeps every detail a
                    click away.
                  </small>
                </div>
                <div className="hero-footer">
                  <div className="hero-actions">
                    <Link className="button hero-button" to="/tasks/new">
                      <Icon name="plus" size={18} />
                      New booking task
                    </Link>
                  </div>
                </div>
              </section>
            )
          )}

          {later.length > 0 && (
            <Panel title="Up next" actions={<Link to="/tasks">All tasks</Link>} className="table-panel">
              <TaskTable journeys={later.slice(0, 5)} now={now} compact />
            </Panel>
          )}

          {setupLeft > 0 && (
            <Panel title="Get ready" description={`${setup.length - setupLeft} of ${setup.length} done`}>
              <ol className="setup-list">
                {setup.map(({ done, title, body, to, state, icon }) => (
                  <li key={title} className={done ? 'done' : undefined}>
                    <span className="option-icon">
                      <Icon name={done ? 'check' : icon} size={18} />
                    </span>
                    <span className="list-text">
                      <strong>{title}</strong>
                      <small>{body}</small>
                    </span>
                    {!done && (
                      <Link className="button secondary small" to={to} state={state}>
                        Start
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>

        <div className="dashboard-side">
          <section className="stat-grid" aria-label="Summary">
            {stats.map(({ label, value, to }) => (
              <Link key={label} to={to} className="stat">
                <small>{label}</small>
                <strong>{value}</strong>
              </Link>
            ))}
          </section>

          <Panel title="Recent PNRs" actions={<Link to="/pnr">All PNRs</Link>}>
            {recentPnrs.length === 0 ? (
              <p className="muted">PNRs from finished booking sessions land here.</p>
            ) : (
              <ul className="plain-list">
                {recentPnrs.map(({ id, pnr, note, savedAt }) => (
                  <li key={id}>
                    <Link to="/pnr" className="list-row">
                      <span className="option-icon">
                        <Icon name="ticket" size={18} />
                      </span>
                      <span className="list-text">
                        <strong className="mono">{formatPnr(pnr)}</strong>
                        <small>{note || `Saved ${formatSavedDate(savedAt)}`}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Practice makes fast"
            description="Tatkal sells out in minutes. Rehearse the steps until they're second nature."
          >
            <Link className="button secondary" to="/practice">
              <Icon name="timer" size={18} />
              Start a practice run
            </Link>
          </Panel>
        </div>
      </div>
    </>
  )
}
