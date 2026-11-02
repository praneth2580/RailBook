// Booking windows follow Indian time, so dates and times show in IST whatever the device's zone.
const IST = 'Asia/Kolkata'

const dayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const clockFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const hourFormat = new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', hourCycle: 'h23' })
// en-CA formats dates as YYYY-MM-DD, the form date inputs use.
const isoDateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: IST })

/** Today's date in IST as YYYY-MM-DD. */
export function todayIso(now = Date.now()) {
  return isoDateFormat.format(now)
}

/** Formats a YYYY-MM-DD journey date, such as "Tue, 15 Dec". */
export function formatJourneyDate(date: string) {
  return date ? dayFormat.format(new Date(`${date}T12:00:00+05:30`)) : ''
}

export function formatWindow(at: Date) {
  return `${dayFormat.format(at)}, ${timeFormat.format(at)} IST`
}

export function formatClock(at: number) {
  return clockFormat.format(at)
}

export function formatSavedDate(iso: string) {
  return dayFormat.format(new Date(iso))
}

export function formatPnr(pnr: string) {
  return `${pnr.slice(0, 3)}-${pnr.slice(3)}`
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`
}

/** Elapsed time as MM:SS, for a running session. */
export function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  return [Math.floor(totalSeconds / 60), totalSeconds % 60].map((part) => String(part).padStart(2, '0')).join(':')
}

export function greeting(now: number) {
  const hour = Number(hourFormat.format(now))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}
