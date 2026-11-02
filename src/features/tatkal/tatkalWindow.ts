import type { Journey, Quota, TravelClass } from '../../core/types'

const AC_CLASSES: ReadonlySet<TravelClass> = new Set(['2A', '3A', '3E', 'CC', 'EC'])

const AC_OPENING_HOUR = '10'
const NON_AC_OPENING_HOUR = '11'

// General quota opens at 08:00 IST, 60 days before the journey (the advance reservation period since November 2024).
const GENERAL_OPENING_HOUR = '08'
const GENERAL_DAYS_AHEAD = 60

function openingTime(journeyDate: string, hour: string, daysBefore: number) {
  const opensAt = new Date(`${journeyDate}T${hour}:00:00+05:30`)
  // IST has no daylight saving, so a UTC day is always a full IST day.
  opensAt.setUTCDate(opensAt.getUTCDate() - daysBefore)
  return opensAt
}

/** Tatkal opens the day before departure: 10:00 IST for AC classes, 11:00 IST for the rest. */
export function tatkalOpensAt(journeyDate: string, travelClass: TravelClass): Date {
  return openingTime(journeyDate, AC_CLASSES.has(travelClass) ? AC_OPENING_HOUR : NON_AC_OPENING_HOUR, 1)
}

/** Premium Tatkal opens with Tatkal. */
export function bookingOpensAt(journeyDate: string, travelClass: TravelClass, quota: Quota = 'Tatkal'): Date {
  return quota === 'General'
    ? openingTime(journeyDate, GENERAL_OPENING_HOUR, GENERAL_DAYS_AHEAD)
    : tatkalOpensAt(journeyDate, travelClass)
}

export function journeyOpensAt(journey: Journey) {
  return bookingOpensAt(journey.date, journey.travelClass, journey.quota)
}

export function formatCountdown(milliseconds: number): string {
  if (milliseconds <= 0) return 'Open now'

  const totalSeconds = Math.ceil(milliseconds / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor(totalSeconds / 3600) % 24
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  const clock = [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')

  return days > 0 ? `${days}d ${clock}` : clock
}
