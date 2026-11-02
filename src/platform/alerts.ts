import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

/** Lead times the person can choose from in Settings. */
export const ALERT_MINUTE_OPTIONS = [30, 15, 10, 5, 2, 1]

export interface AlertResult {
  scheduled: number
  /** False when Android may deliver the alerts late. */
  exact: boolean
}

// Android 14 denies exact alarms by default, even with the manifest permission.
async function exactAlarmsAllowed() {
  if (Capacitor.getPlatform() !== 'android') return true
  const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
  return exact_alarm === 'granted'
}

// Notification ids must be integers, and stable so rescheduling replaces earlier alerts.
function alertId(journeyId: string, minutesBefore: number) {
  let hash = minutesBefore
  for (const character of journeyId) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0
  }
  return hash
}

export function cancelWindowAlerts(journeyId: string) {
  return LocalNotifications.cancel({
    notifications: ALERT_MINUTE_OPTIONS.map((minutes) => ({ id: alertId(journeyId, minutes) })),
  })
}

/** Returns null if notification permission was refused. */
export async function scheduleWindowAlerts(
  journeyId: string,
  title: string,
  opensAt: Date,
  minutesBefore: number[],
): Promise<AlertResult | null> {
  const { display } = await LocalNotifications.requestPermissions()
  if (display !== 'granted') return null

  // Lead times may have changed since the last time, so clear every option first.
  await cancelWindowAlerts(journeyId)
  const notifications = minutesBefore
    .map((minutes) => ({
      id: alertId(journeyId, minutes),
      title,
      body: `Booking opens in ${minutes} min`,
      schedule: { at: new Date(opensAt.getTime() - minutes * 60_000), allowWhileIdle: true },
    }))
    .filter(({ schedule }) => schedule.at.getTime() > Date.now())

  if (notifications.length > 0) await LocalNotifications.schedule({ notifications })
  return { scheduled: notifications.length, exact: await exactAlarmsAllowed() }
}
