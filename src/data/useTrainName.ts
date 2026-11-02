import { useEffect, useState } from 'react'
import { bundledTimetable } from './bundledTimetable'

export function useTrainName(trainNumber: string) {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    if (!trainNumber) {
      setName(null)
      return
    }
    void bundledTimetable.findTrain(trainNumber).then((train) => {
      if (current) setName(train?.name ?? null)
    })
    return () => {
      current = false
    }
  }, [trainNumber])

  return name
}
