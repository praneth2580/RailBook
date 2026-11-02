import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatJourneyDate, formatPnr, formatWindow } from '../../core/format'
import type { Journey, PaymentMethod } from '../../core/types'
import { Icon, type IconName } from '../../ui/Icon'
import { ProgressBar, StatusChip, type Tone } from '../../ui/layout'
import { readinessChecks } from '../tatkal/readiness'
import { formatCountdown, journeyOpensAt } from '../tatkal/tatkalWindow'
import { STATUS_LABELS, taskStatus, type TaskStatus } from './tasks'

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

/** Countdown card for a task that is still waiting for, or inside, its booking window. */
export function WindowHero({ journey, now, label }: { journey: Journey; now: number; label: string }) {
  const status = taskStatus(journey, now)
  const opensAt = journeyOpensAt(journey)
  const checks = readinessChecks(journey)
  const done = checks.filter((check) => check.done).length

  return (
    <section className={`hero ${status}`}>
      <div className="hero-top">
        <span className="hero-label">{label}</span>
        <TaskStatusChip status={status} />
      </div>
      <RouteLine from={journey.from} to={journey.to} />
      <small>
        {journey.trainNumber} · {journey.travelClass} · {journey.quota ?? 'Tatkal'} · {formatJourneyDate(journey.date)}
      </small>
      <strong className="hero-countdown">{formatCountdown(opensAt.getTime() - now)}</strong>
      <small>{status === 'open' ? 'The booking window is open' : `Opens ${formatWindow(opensAt)}`}</small>
      <div className="hero-progress">
        <span>
          Ready {done}/{checks.length}
        </span>
        <ProgressBar value={done / checks.length} label="Readiness" />
      </div>
      <Link className="button hero-button" to={`/tasks/${journey.id}/run`}>
        <Icon name="play" />
        Start booking session
      </Link>
    </section>
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
