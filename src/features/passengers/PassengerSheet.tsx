import { useState, type FormEvent } from 'react'
import {
  BERTH_PREFERENCES,
  FOOD_CHOICES,
  GENDERS,
  type BerthPreference,
  type FoodChoice,
  type Gender,
  type Passenger,
} from '../../core/types'
import { ChoiceChips, Segmented } from '../../ui/controls'
import { Sheet } from '../../ui/layout'

export function describePassenger({ age, gender, berthPreference, foodChoice }: Passenger) {
  const parts = [String(age), gender, berthPreference === 'None' ? 'Any berth' : `${berthPreference} berth`]
  if (foodChoice && foodChoice !== 'No food') parts.push(foodChoice)
  return parts.join(' · ')
}

export function PassengerSheet({
  open,
  passenger,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  /** Leave out to add a new passenger. */
  passenger?: Passenger
  onClose: () => void
  onSave: (passenger: Passenger) => void
  onDelete?: (id: string) => void
}) {
  return (
    <Sheet open={open} title={passenger ? 'Edit passenger' : 'Add passenger'} onClose={onClose}>
      <PassengerForm passenger={passenger} onSave={onSave} onDelete={onDelete} />
    </Sheet>
  )
}

function PassengerForm({
  passenger,
  onSave,
  onDelete,
}: {
  passenger?: Passenger
  onSave: (passenger: Passenger) => void
  onDelete?: (id: string) => void
}) {
  const [name, setName] = useState(passenger?.name ?? '')
  const [age, setAge] = useState(passenger ? String(passenger.age) : '')
  const [gender, setGender] = useState<Gender>(passenger?.gender ?? 'Male')
  const [berthPreference, setBerthPreference] = useState<BerthPreference>(passenger?.berthPreference ?? 'None')
  const [foodChoice, setFoodChoice] = useState<FoodChoice>(passenger?.foodChoice ?? 'No food')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave({
      id: passenger?.id ?? crypto.randomUUID(),
      name: name.trim(),
      age: Number(age),
      gender,
      berthPreference,
      foodChoice,
    })
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label className="field">
        <span>Name as on ID</span>
        <input required autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="field">
        <span>Age</span>
        <input
          required
          type="number"
          inputMode="numeric"
          min="0"
          max="125"
          value={age}
          onChange={(event) => setAge(event.target.value)}
        />
      </label>
      <div className="field">
        <span>Gender</span>
        <Segmented label="Gender" options={GENDERS} value={gender} onChange={setGender} />
      </div>
      <div className="field">
        <span>Berth preference</span>
        <ChoiceChips
          label="Berth preference"
          options={BERTH_PREFERENCES}
          value={berthPreference}
          onChange={setBerthPreference}
        />
      </div>
      <div className="field">
        <span>Food</span>
        <Segmented label="Food" options={FOOD_CHOICES} value={foodChoice} onChange={setFoodChoice} />
      </div>
      <button type="submit" className="button">
        {passenger ? 'Save changes' : 'Add passenger'}
      </button>
      {passenger && onDelete && (
        <button type="button" className="button ghost danger-text" onClick={() => onDelete(passenger.id)}>
          Delete passenger
        </button>
      )}
    </form>
  )
}
