import { createCollection } from '../core/storage'

/** Lead times the person can choose from in Settings. */
export const ALERT_MINUTE_OPTIONS = [30, 15, 10, 5, 2, 1]

export interface AlertResult {
  scheduled: number
}

interface SavedAlert {
  id: string
  journeyId: string
  title: string
  at: string
  opensAt: string
}

// Saved so alerts survive restarting RailBook. They only fire while it's open.
const alertCollection = createCollection<SavedAlert>('windowAlerts')
const CHECK_EVERY_MS = 60_000

let timer: ReturnType<typeof setTimeout> | undefined
let checking = Promise.resolve()

async function notificationsAllowed() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'default') await Notification.requestPermission()
  return Notification.permission === 'granted'
}

function show(tag: string, title: string, body: string) {
  const notification = new Notification(title, { body, tag })
  notification.onclick = () => window.focus()
}

async function fireDueAlerts() {
  clearTimeout(timer)
  const now = Date.now()
  const pending: SavedAlert[] = []
  for (const alert of await alertCollection.list()) {
    if (Date.parse(alert.at) > now) {
      pending.push(alert)
      continue
    }
    // An alert is only useful before its window opens, e.g. after the computer wakes up late.
    const minutesLeft = Math.ceil((Date.parse(alert.opensAt) - now) / 60_000)
    if (minutesLeft > 0) show(`window:${alert.journeyId}`, alert.title, `Booking opens in ${minutesLeft} min`)
    await alertCollection.remove(alert.id)
  }
  if (pending.length === 0) return
  // Wake at least once a minute, since timers don't count time the computer spends asleep.
  const next = Math.min(...pending.map(({ at }) => Date.parse(at)))
  timer = setTimeout(armSavedAlerts, Math.min(Math.max(next - now, 0), CHECK_EVERY_MS))
}

/** Starts watching saved alerts. Safe to call again: checks run one at a time. */
export function armSavedAlerts() {
  checking = checking.then(fireDueAlerts).catch(() => undefined)
  return checking
}

export async function cancelWindowAlerts(journeyId: string) {
  for (const alert of await alertCollection.list()) {
    if (alert.journeyId === journeyId) await alertCollection.remove(alert.id)
  }
  await armSavedAlerts()
}

/** Returns null if notification permission was refused. */
export async function scheduleWindowAlerts(
  journeyId: string,
  title: string,
  opensAt: Date,
  minutesBefore: number[],
): Promise<AlertResult | null> {
  if (!(await notificationsAllowed())) return null

  // Lead times may have changed since the last time, so clear the journey's alerts first.
  await cancelWindowAlerts(journeyId)
  const alerts = minutesBefore
    .map((minutes) => ({
      id: `${journeyId}:${minutes}`,
      journeyId,
      title,
      at: new Date(opensAt.getTime() - minutes * 60_000).toISOString(),
      opensAt: opensAt.toISOString(),
    }))
    .filter(({ at }) => Date.parse(at) > Date.now())

  for (const alert of alerts) await alertCollection.save(alert)
  await armSavedAlerts()
  return { scheduled: alerts.length }
}

/** Shows a notification now, replacing the last one with the same key. Returns false if permission was refused. */
export async function showNotice(key: string, title: string, body: string) {
  if (!(await notificationsAllowed())) return false
  show(key, title, body)
  return true
}
