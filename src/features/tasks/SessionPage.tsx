import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { journeyCollection, passengerCollection, pnrCollection } from '../../core/collections'
import { formatJourneyDate } from '../../core/format'
import { useCollection } from '../../core/storage'
import type { BookingOutcome } from '../../core/types'
import { BookingSession } from './BookingSession'

export function SessionPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { items: journeys, loaded, save } = useCollection(journeyCollection)
  const { items: passengers } = useCollection(passengerCollection)
  const { save: savePnr } = useCollection(pnrCollection)

  const journey = journeys.find((other) => other.id === id)
  if (!loaded) return null
  if (!journey) return <Navigate to="/tasks" replace />

  const record = (outcome: BookingOutcome) => save({ ...journey, outcome })

  return (
    <BookingSession
      journey={journey}
      passengers={passengers.filter((passenger) => journey.passengerIds.includes(passenger.id))}
      onExit={() => navigate(`/tasks/${journey.id}`, { replace: true })}
      onJourneyChange={save}
      onBooked={async (pnr, seconds) => {
        const at = new Date().toISOString()
        await record({ result: 'booked', pnr, at, seconds })
        await savePnr({
          id: crypto.randomUUID(),
          pnr,
          note: `${journey.from} to ${journey.to}, ${formatJourneyDate(journey.date)}`,
          savedAt: at,
        })
      }}
      onNotBooked={(reason, seconds) => record({ result: 'not-booked', reason, at: new Date().toISOString(), seconds })}
    />
  )
}
