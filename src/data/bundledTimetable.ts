import type { Train } from '../core/types'
import type { TimetableProvider } from './providers'

// public/data/timetable.json stays empty until a dataset with clear usage terms is chosen.
export const bundledTimetable: TimetableProvider = {
  async findTrain(trainNumber) {
    const response = await fetch('/data/timetable.json')
    const trains = (await response.json()) as Train[]
    return trains.find(({ number }) => number === trainNumber) ?? null
  },
}
