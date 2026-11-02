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
import { Avatar, ConfirmSheet, PageHeader, SectionHead } from '../../ui/layout'
import { describePassenger } from '../passengers/PassengerSheet'
import { CopyPanel } from '../tatkal/CopyPanel'
import { ReadinessCard } from '../tatkal/ReadinessCard'
import { journeyOpensAt } from '../tatkal/tatkalWindow'
import { Facts, RouteLine, TaskStatusChip, WindowHero, journeyFacts } from './TaskParts'
import { isActive, taskStatus } from './tasks'

export function TaskDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items: journeys, loaded, save, remove } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const { settings } = useSettings()
  const [deleting, setDeleting] = useState(false)
  const now = useNow()

  const journey = journeys.find((other) => other.id === id)
  if (!loaded) return null
  if (!journey) return <Navigate to="/tasks" replace />

  const status = taskStatus(journey, now)
  const chosen = passengers.filter((passenger) => journey.passengerIds.includes(passenger.id))

  const deleteTask = async () => {
    await remove(journey.id)
    navigate('/tasks', { replace: true })
    void cancelWindowAlerts(journey.id)
  }

  return (
    <>
      <PageHeader
        title="Booking task"
        subtitle={`${journey.from} to ${journey.to}`}
        back="/tasks"
        actions={
          <>
            <Link className="icon-button" to={`/tasks/${journey.id}/edit`} aria-label="Edit task">
              <Icon name="edit" />
            </Link>
            <button type="button" className="icon-button" aria-label="Delete task" onClick={() => setDeleting(true)}>
              <Icon name="trash" />
            </button>
          </>
        }
      />

      {isActive(status) ? (
        <WindowHero journey={journey} now={now} label="Booking window" />
      ) : (
        <OutcomeHero journey={journey} onRetry={() => save({ ...journey, outcome: undefined })} />
      )}

      {isActive(status) && <AlertsCard journey={journey} minutes={settings.alertMinutes} />}

      <SummaryCard journey={journey} />
      <PassengersCard passengers={chosen} />
      {isActive(status) && (
        <>
          <ReadinessCard journey={journey} onChange={save} />
          <CopyPanel journey={journey} passengers={chosen} username={settings.profile.irctcUsername} />
          <button type="button" className="button secondary" onClick={() => openOfficialPage('booking')}>
            <Icon name="external" />
            Open IRCTC
          </button>
        </>
      )}

      <ConfirmSheet
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
  const [copied, setCopied] = useState(false)

  if (outcome?.result === 'booked') {
    const checkStatus = async () => {
      await copyText(outcome.pnr)
      setCopied(true)
      await openOfficialPage('pnr')
    }
    return (
      <section className="hero booked">
        <div className="hero-top">
          <span className="hero-label">Ticket booked</span>
          <TaskStatusChip status="booked" />
        </div>
        <RouteLine from={journey.from} to={journey.to} />
        <small>PNR</small>
        <strong className="hero-countdown">{formatPnr(outcome.pnr)}</strong>
        <small>
          Booked {formatSavedDate(outcome.at)} in {formatDuration(outcome.seconds)}
        </small>
        <button type="button" className="button hero-button" onClick={checkStatus}>
          <Icon name={copied ? 'check' : 'external'} />
          {copied ? 'PNR copied, opening status page' : 'Check PNR status'}
        </button>
      </section>
    )
  }

  if (outcome?.result === 'not-booked') {
    return (
      <section className="hero not-booked">
        <div className="hero-top">
          <span className="hero-label">Not booked</span>
          <TaskStatusChip status="not-booked" />
        </div>
        <RouteLine from={journey.from} to={journey.to} />
        <strong className="hero-title">{outcome.reason}</strong>
        <small>Recorded {formatSavedDate(outcome.at)}</small>
        <button type="button" className="button hero-button" onClick={onRetry}>
          <Icon name="refresh" />
          Reopen task
        </button>
      </section>
    )
  }

  return (
    <section className="hero expired">
      <div className="hero-top">
        <span className="hero-label">Journey date passed</span>
        <TaskStatusChip status="expired" />
      </div>
      <RouteLine from={journey.from} to={journey.to} />
      <small>Edit the task with a new date to use it again.</small>
      <Link className="button hero-button" to={`/tasks/${journey.id}/edit`}>
        <Icon name="edit" />
        Edit task
      </Link>
    </section>
  )
}

function AlertsCard({ journey, minutes }: { journey: Journey; minutes: number[] }) {
  const [message, setMessage] = useState('')

  const setAlerts = async () => {
    const result = await scheduleWindowAlerts(journey.id, `${journey.from} to ${journey.to}`, journeyOpensAt(journey), minutes)
    if (result === null) setMessage('Notifications are turned off for RailBook.')
    else if (result.scheduled === 0) setMessage('The window is too close for alerts.')
    else setMessage(`${result.scheduled} alerts set.`)
  }

  return (
    <section className="card">
      <div className="card-row">
        <span className="option-icon">
          <Icon name="bell" />
        </span>
        <span className="list-text">
          <strong>Window alerts</strong>
          <small>
            {minutes.length > 0
              ? `${minutes.join(', ')} min before booking opens`
              : 'Choose lead times in Settings first'}
          </small>
        </span>
        <button type="button" className="button small" disabled={minutes.length === 0} onClick={setAlerts}>
          Set
        </button>
      </div>
      <small className="muted">
        {message || 'Alerts appear while RailBook is open, so keep it running before the window.'}
      </small>
    </section>
  )
}

function SummaryCard({ journey }: { journey: Journey }) {
  const trainName = useTrainName(journey.trainNumber)
  const preferences = journey.preferences

  return (
    <section className="card">
      <SectionHead title="Journey" />
      <Facts items={journeyFacts(journey, trainName)} />
      {preferences && (
        <div className="pills">
          {preferences.autoUpgrade && <span className="pill">Auto-upgrade</span>}
          {preferences.confirmedBerthsOnly && <span className="pill">Confirmed berths only</span>}
          {preferences.travelInsurance && <span className="pill">Travel insurance</span>}
          {preferences.mobile && <span className="pill">Ticket to {preferences.mobile}</span>}
        </div>
      )}
    </section>
  )
}

function PassengersCard({ passengers }: { passengers: Passenger[] }) {
  return (
    <section className="card">
      <SectionHead title={`Passengers (${passengers.length})`} />
      {passengers.length === 0 ? (
        <small className="muted">No passengers chosen. Edit the task to add some.</small>
      ) : (
        <ul className="mini-list">
          {passengers.map((passenger) => (
            <li key={passenger.id}>
              <Avatar id={passenger.id} name={passenger.name} />
              <span className="list-text">
                <strong>{passenger.name}</strong>
                <small>{describePassenger(passenger)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
