import { createCollection } from './storage'
import type { Journey, Passenger, SavedPnr } from './types'

export const passengerCollection = createCollection<Passenger>('passengers')
export const journeyCollection = createCollection<Journey>('journeys')
export const pnrCollection = createCollection<SavedPnr>('pnrs')
