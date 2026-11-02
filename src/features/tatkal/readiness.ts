import type { Journey } from '../../core/types'

export interface ReadinessCheck {
  id: string
  label: string
  done: boolean
  /** Automatic checks come from saved data. Manual ones are confirmed by the person. */
  manual: boolean
}

const MANUAL_CHECKS = [
  { id: 'aadhaar', label: 'Aadhaar linked and verified on the IRCTC account' },
  { id: 'master-list', label: "Passengers added to IRCTC's Master List" },
  { id: 'payment', label: 'Payment method ready' },
]

export function readinessChecks(journey: Journey): ReadinessCheck[] {
  return [
    { id: 'passengers', label: 'Passengers chosen', done: journey.passengerIds.length > 0, manual: false },
    { id: 'backup-train', label: 'Backup train chosen', done: journey.backupTrainNumber !== '', manual: false },
    ...MANUAL_CHECKS.map((check) => ({
      ...check,
      done: journey.confirmedChecks.includes(check.id),
      manual: true,
    })),
  ]
}
