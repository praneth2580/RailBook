import type { Train } from '../core/types'

export interface TimetableProvider {
  findTrain(trainNumber: string): Promise<Train | null>
}

export interface PnrStatus {
  pnr: string
  chartPrepared: boolean
  passengers: { current: string; booking: string }[]
}

/**
 * Optional live status source. Implementations call a third-party API with a key the
 * user supplies, never a key shipped in the app. Without one, the app opens the official page.
 */
export interface PnrStatusProvider {
  getStatus(pnr: string): Promise<PnrStatus>
}
