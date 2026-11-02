import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatJourneyDate, formatPnr, formatWindow } from '../../core/format'
import type { Journey, PaymentMethod } from '../../core/types'
import { Icon, type IconName } from '../../ui/Icon'
import { ProgressBar, StatusChip, type Tone } from '../../ui/layout'
import { readinessChecks } from '../tatkal/readiness'
import { formatCountdown, journeyOpensAt } from '../tatkal/tatkalWindow'
import { STATUS_LABELS, isActive, taskStatus, type TaskStatus } from './tasks'

const STATUS_TONES: Record<TaskStatus, Tone> = {
  scheduled: 'info',
  open: 'live',
  booked: 'success',
  'not-booked': 'danger',
  expired: 'muted',
}

export const PAYMENT_DETAILS: Record<PaymentMethod, { icon: IconName; detail: string }> = {
  UPI: { icon: 'phone', detail: 'Any UPI app' },
  Card: { icon: 'card', detail: 'Debit or credit card' },
  'Net banking': { icon: 'bank', detail: 'Straight from your bank' },
  'IRCTC eWallet': { icon: 'wallet', detail: 'Prepaid IRCTC balance' },
}

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return <StatusChip tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</StatusChip>
}

export function RouteLine({ from, to }: { from: string; to: string }) {
  return (
    <div className="route">
      <strong>{from}</strong>
      <span className="route-track" aria-label="to">
        <Icon name="train" size={16} />
      </span>
      <strong>{to}</strong>
    </div>
  )
}

export function Facts({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function journeyFacts(journey: Journey, trainName: string | null): [string, ReactNode][] {
  const facts: [string, ReactNode][] = [
    ['Date', formatJourneyDate(journey.date)],
    ['Train', trainName ? `${journey.trainNumber} · ${trainName}` : journey.trainNumber],
    ['Class', journey.travelClass],
    ['Quota', journey.quota ?? 'Tatkal'],
  ]
  if (journey.backupTrainNumber) facts.push(['Backup train', journey.backupTrainNumber])
  if (journey.boardingStation) facts.push(['Boarding', journey.boardingStation])
  if (journey.paymentMethod) facts.push(['Payment', journey.paymentMethod])
  return facts
}

/** A wide coloured banner: what the task is on the left, the big number on the right, actions underneath. */
export function Hero({
  tone,
  label,
  status,
  journey,
  value,
  caption,
  footer,
}: {
  tone: TaskStatus
  label: string
  status: TaskStatus
  journey: Journey
  value: ReactNode
  caption: ReactNode
  footer: ReactNode
}) {
  return (
    <section className={`hero ${tone}`}>
      <div className="hero-main">
        <div className="hero-top">
          <span className="hero-label">{label}</span>
          <TaskStatusChip status={status} />
        </div>
        <RouteLine from={journey.from} to={journey.to} />
        <small>
          {journey.trainNumber} · {journey.travelClass} · {journey.quota ?? 'Tatkal'} ·{' '}
          {formatJourneyDate(journey.date)}
        </small>
      </div>
      <div className="hero-figure">
        <strong className="hero-countdown">{value}</strong>
        <small>{caption}</small>
      </div>
      <div className="hero-footer">{footer}</div>
    </section>
  )
}

/** Countdown banner for a task that is still waiting for, or inside, its booking window. */
export function WindowHero({
  journey,
  now,
  label,
  actions,
}: {
  journey: Journey
  now: number
  label: string
  actions: ReactNode
}) {
  const status = taskStatus(journey, now)
  const opensAt = journeyOpensAt(journey)
  const checks = readinessChecks(journey)
  const done = checks.filter((check) => check.done).length

  return (
    <Hero
      tone={status}
      label={label}
      status={status}
      journey={journey}
      value={formatCountdown(opensAt.getTime() - now)}
      caption={status === 'open' ? 'The booking window is open' : `Opens ${formatWindow(opensAt)}`}
      footer={
        <>
          <div className="hero-progress">
            <span>
              Ready {done} of {checks.length}
            </span>
            <ProgressBar value={done / checks.length} label="Readiness" />
          </div>
          <div className="hero-actions">{actions}</div>
        </>
      }
    />
  )
}

/** Rows open the task. The route is a real link, so the table works from the keyboard too. */
export function TaskTable({ journeys, now, compact = false }: { journeys: Journey[]; now: number; compact?: boolean }) {
  const navigate = useNavigate()

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Journey</th>
          <th>Date</th>
          {!compact && <th>Class · quota</th>}
          {!compact && <th className="numeric">Passengers</th>}
          <th>Booking window</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {journeys.map((journey) => {
          const status = taskStatus(journey, now)
          const opensAt = journeyOpensAt(journey)
          return (
            <tr key={journey.id} className="clickable" onClick={() => navigate(`/tasks/${journey.id}`)}>
              <td>
                <Link to={`/tasks/${journey.id}`} className="cell-main" onClick={(event) => event.stopPropagation()}>
                  <strong>
                    {journey.from} → {journey.to}
                  </strong>
                  <small>
                    Train {journey.trainNumber}
                    {journey.backupTrainNumber && `, backup ${journey.backupTrainNumber}`}
                  </small>
                </Link>
              </td>
              <td>{formatJourneyDate(journey.date)}</td>
              {!compact && (
                <td>
                  {journey.travelClass} · {journey.quota ?? 'Tatkal'}
                </td>
              )}
              {!compact && <td className="numeric">{journey.passengerIds.length}</td>}
              <td>
                {isActive(status) ? (
                  <span className="cell-main">
                    <strong className="tabular">{formatCountdown(opensAt.getTime() - now)}</strong>
                    <small>{formatWindow(opensAt)}</small>
                  </span>
                ) : journey.outcome ? (
                  <OutcomeLine journey={journey} />
                ) : (
                  <span className="muted">Journey date passed</span>
                )}
              </td>
              <td>
                <TaskStatusChip status={status} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function OutcomeLine({ journey }: { journey: Journey }) {
  const { outcome } = journey
  if (!outcome) return null
  return outcome.result === 'booked' ? (
    <span className="outcome success">
      <Icon name="ticket" size={16} />
      PNR {formatPnr(outcome.pnr)}
    </span>
  ) : (
    <span className="outcome danger">
      <Icon name="alert" size={16} />
      {outcome.reason}
    </span>
  )
}
