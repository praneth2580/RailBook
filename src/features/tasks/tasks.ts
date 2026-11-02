import type { Journey, Quota } from '../../core/types'
import { journeyOpensAt } from '../tatkal/tatkalWindow'

export type TaskStatus = 'scheduled' | 'open' | 'booked' | 'not-booked' | 'expired'

export const STATUS_LABELS: Record<TaskStatus, string> = {
  scheduled: 'Scheduled',
  open: 'Window open',
  booked: 'Booked',
  'not-booked': 'Not booked',
  expired: 'Expired',
}

/** Recorded outcomes win. Otherwise the status follows the clock until the journey day ends in IST. */
export function taskStatus(journey: Journey, now: number): TaskStatus {
  if (journey.outcome) return journey.outcome.result
  if (now > new Date(`${journey.date}T23:59:59.999+05:30`).getTime()) return 'expired'
  return now >= journeyOpensAt(journey).getTime() ? 'open' : 'scheduled'
}

export function isActive(status: TaskStatus) {
  return status === 'scheduled' || status === 'open'
}

/** IRCTC allows four passengers per Tatkal ticket and six on a General one. */
export function passengerLimit(quota: Quota = 'Tatkal') {
  return quota === 'General' ? 6 : 4
}

export function byWindow(a: Journey, b: Journey) {
  return journeyOpensAt(a).getTime() - journeyOpensAt(b).getTime()
}
