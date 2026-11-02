import { useNavigate } from 'react-router-dom'
import type { Journey, Passenger } from '../../core/types'
import { BookingSession } from '../tasks/BookingSession'

// Sample details for the rehearsal, so practice never touches saved data.
const SAMPLE_JOURNEY: Journey = {
  id: 'practice',
  trainNumber: '12345',
  backupTrainNumber: '12346',
  travelClass: '3A',
  quota: 'Tatkal',
  date: '2026-12-15',
  from: 'NDLS',
  to: 'MMCT',
  boardingStation: '',
  passengerIds: ['practice-1', 'practice-2'],
  confirmedChecks: [],
  paymentMethod: 'UPI',
  preferences: { autoUpgrade: true, confirmedBerthsOnly: false, travelInsurance: false, mobile: '9000000000' },
}

const SAMPLE_PASSENGERS: Passenger[] = [
  { id: 'practice-1', name: 'Asha Rao', age: 34, gender: 'Female', berthPreference: 'Lower', foodChoice: 'Veg' },
  { id: 'practice-2', name: 'Vikram Rao', age: 36, gender: 'Male', berthPreference: 'Upper', foodChoice: 'No food' },
]

// A rehearsal only. Nothing on this page connects to IRCTC.
export function PracticePage() {
  const navigate = useNavigate()

  return (
    <BookingSession
      practice
      journey={SAMPLE_JOURNEY}
      passengers={SAMPLE_PASSENGERS}
      onExit={() => navigate(-1)}
    />
  )
}
