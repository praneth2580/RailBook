import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { journeyCollection, passengerCollection } from '../../core/collections'
import { formatDuration, formatPnr, formatSavedDate } from '../../core/format'
import { useSettings } from '../../core/settings'
import { useCollection } from '../../core/storage'
import type { Journey, Passenger } from '../../core/types'
import { useNow } from '../../core/useNow'
import { useTrainName } from '../../data/useTrainName'
import { cancelWindowAlerts, scheduleWindowAlerts } from '../../platform/alerts'
import { copyText } from '../../platform/clipboard'
import { openOfficialPage } from '../../platform/officialPages'
import { Icon } from '../../ui/Icon'
import { Avatar, ConfirmDialog, PageHeader, Panel } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { CopyPanel } from '../tatkal/CopyPanel'
import { ReadinessCard } from '../tatkal/ReadinessCard'
import { journeyOpensAt } from '../tatkal/tatkalWindow'
import { Facts, Hero, WindowHero, journeyFacts } from './TaskParts'
import { isActive, taskStatus } from './tasks'

export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items: journeys, loaded, save, remove } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const { settings } = useSettings()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const now = useNow()
  const trainName = useTrainName(journeys.find((other) => other.id === id)?.trainNumber ?? '')

  const journey = journeys.find((other) => other.id === id)
  if (!loaded) return null
  if (!journey) return <Navigate to="/tasks" replace />

  const status = taskStatus(journey, now)
  const active = isActive(status)
  const chosen = passengers.filter((passenger) => journey.passengerIds.includes(passenger.id))

  const deleteTask = async () => {
    await remove(journey.id)
    navigate('/tasks', { replace: true })
    void cancelWindowAlerts(journey.id)
    toast(`Deleted ${journey.from} → ${journey.to}`)
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Booking tasks', to: '/tasks' }]}
        title={`${journey.from} → ${journey.to}`}
        subtitle={`Train ${journey.trainNumber}${trainName ? ` ${trainName}` : ''} · ${journey.travelClass} · ${journey.quota ?? 'Tatkal'}`}
        actions={
          <>
            <button
              type="button"
              className="icon-button"
              aria-label="Delete task"
              title="Delete task"
              onClick={() => setDeleting(true)}
            >
              <Icon name="trash" size={18} />
            </button>
            <Link className="button secondary" to={`/tasks/${journey.id}/edit`}>
              <Icon name="edit" size={16} />
              Edit
            </Link>
            {active && (
              <>
                <button type="button" className="button secondary" onClick={() => openOfficialPage('booking')}>
                  <Icon name="external" size={16} />
                  Open IRCTC
                </button>
                <Link className="button" to={`/tasks/${journey.id}/run`}>
                  <Icon name="play" size={16} />
                  Start session
                </Link>
              </>
            )}
          </>
        }
      />

      <div className={active ? 'detail-layout' : 'detail-layout single'}>
        <div className="detail-main">
          {active ? (
            <WindowHero
              journey={journey}
              now={now}
              label="Booking window"
              actions={
                <Link className="button hero-button" to={`/tasks/${journey.id}/run`}>
                  <Icon name="play" size={18} />
                  Start booking session
                </Link>
              }
            />
          ) : (
            <OutcomeHero journey={journey} onRetry={() => save({ ...journey, outcome: undefined })} />
          )}
          <SummaryPanel journey={journey} trainName={trainName} />
          <PassengersPanel journey={journey} passengers={chosen} />
        </div>

        {active && (
          <aside className="detail-aside">
            <ReadinessCard journey={journey} onChange={save} />
            <AlertsPanel journey={journey} minutes={settings.alertMinutes} />
            <CopyPanel journey={journey} passengers={chosen} username={settings.profile.irctcUsername} />
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        title="Delete this task?"
        body="Its alerts are cancelled too. Saved passengers and PNRs stay."
        confirmLabel="Delete task"
        onConfirm={deleteTask}
        onClose={() => setDeleting(false)}
      />
    </>
  )
}

function OutcomeHero({ journey, onRetry }: { journey: Journey; onRetry: () => void }) {
  const { outcome } = journey
  const toast = useToast()

  if (outcome?.result === 'booked') {
    const checkStatus = async () => {
      await copyText(outcome.pnr)
      await openOfficialPage('pnr')
      toast('PNR copied. Paste it on the enquiry page in your browser.')
    }
    return (
      <Hero
        tone="booked"
        label="Ticket booked"
        status="booked"
        journey={journey}
        value={<span className="mono">{formatPnr(outcome.pnr)}</span>}
        caption={`Booked ${formatSavedDate(outcome.at)} in ${formatDuration(outcome.seconds)}`}
        footer={
          <div className="hero-actions">
            <button type="button" className="button hero-button" onClick={checkStatus}>
              <Icon name="external" size={18} />
              Check PNR status
            </button>
          </div>
        }
      />
    )
  }

  if (outcome?.result === 'not-booked') {
    return (
      <Hero
        tone="not-booked"
        label="Not booked"
        status="not-booked"
        journey={journey}
        value={outcome.reason}
        caption={`Recorded ${formatSavedDate(outcome.at)}`}
        footer={
          <div className="hero-actions">
            <button type="button" className="button hero-button" onClick={onRetry}>
              <Icon name="refresh" size={18} />
              Reopen task
            </button>
          </div>
        }
      />
    )
  }

  return (
    <Hero
      tone="expired"
      label="Journey date passed"
      status="expired"
      journey={journey}
      value="Closed"
      caption="Edit the task with a new date to use it again."
      footer={
        <div className="hero-actions">
          <Link className="button hero-button" to={`/tasks/${journey.id}/edit`}>
            <Icon name="edit" size={18} />
            Edit task
          </Link>
        </div>
      }
    />
  )
}

function AlertsPanel({ journey, minutes }: { journey: Journey; minutes: number[] }) {
  const [message, setMessage] = useState('')

  const setAlerts = async () => {
    const result = await scheduleWindowAlerts(
      journey.id,
      `${journey.from} to ${journey.to}`,
      journeyOpensAt(journey),
      minutes,
    )
    if (result === null) setMessage('Notifications are turned off for RailBook.')
    else if (result.scheduled === 0) setMessage('The window is too close for alerts.')
    else setMessage(`${result.scheduled} alerts set. They appear while RailBook is open.`)
  }

  return (
    <Panel
      title="Window alerts"
      description={
        minutes.length > 0 ? `${minutes.join(', ')} min before booking opens` : 'Choose lead times in Settings first'
      }
      actions={
        <button type="button" className="button secondary small" disabled={minutes.length === 0} onClick={setAlerts}>
          <Icon name="bell" size={16} />
          Set alerts
        </button>
      }
    >
      <small className="muted">
        {message || 'Desktop notifications, while RailBook is open. Keep it running before the window.'}
      </small>
    </Panel>
  )
}

function SummaryPanel({ journey, trainName }: { journey: Journey; trainName: string | null }) {
  const preferences = journey.preferences

  return (
    <Panel title="Journey" actions={<Link to={`/tasks/${journey.id}/edit`}>Edit</Link>}>
      <Facts items={journeyFacts(journey, trainName)} />
      {preferences && (
        <div className="pills">
          {preferences.autoUpgrade && <span className="pill">Auto-upgrade</span>}
          {preferences.confirmedBerthsOnly && <span className="pill">Confirmed berths only</span>}
          {preferences.travelInsurance && <span className="pill">Travel insurance</span>}
          {preferences.mobile && <span className="pill">Ticket to {preferences.mobile}</span>}
        </div>
      )}
    </Panel>
  )
}

function PassengersPanel({ journey, passengers }: { journey: Journey; passengers: Passenger[] }) {
  return (
    <Panel
      title={`Passengers · ${passengers.length}`}
      actions={<Link to={`/tasks/${journey.id}/edit`}>Change</Link>}
      className="table-panel"
    >
      {passengers.length === 0 ? (
        <p className="table-empty muted">No passengers chosen. Edit the task to add some.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="numeric">Age</th>
              <th>Gender</th>
              <th>Berth</th>
              <th>Food</th>
            </tr>
          </thead>
          <tbody>
            {passengers.map((passenger) => (
              <tr key={passenger.id}>
                <td>
                  <span className="cell-person">
                    <Avatar id={passenger.id} name={passenger.name} size={28} />
                    {passenger.name}
                  </span>
                </td>
                <td className="numeric">{passenger.age}</td>
                <td>{passenger.gender}</td>
                <td>{passenger.berthPreference === 'None' ? 'Any' : passenger.berthPreference}</td>
                <td>{passenger.foodChoice ?? 'No food'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}
