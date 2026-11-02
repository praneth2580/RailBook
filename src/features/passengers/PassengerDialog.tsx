import { useId, useState, type FormEvent } from 'react'
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
import { Dialog } from '../../ui/layout'

export function describePassenger({ age, gender, berthPreference, foodChoice }: Passenger) {
  const parts = [String(age), gender, berthPreference === 'None' ? 'Any berth' : `${berthPreference} berth`]
  if (foodChoice && foodChoice !== 'No food') parts.push(foodChoice)
  return parts.join(' · ')
}

export function PassengerDialog({
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
  onDelete?: (passenger: Passenger) => void
}) {
  const formId = useId()

  return (
    <Dialog
      open={open}
      title={passenger ? 'Edit passenger' : 'Add passenger'}
      description="Enter the details exactly as they appear on the passenger's ID."
      onClose={onClose}
      footer={
        <>
          {passenger && onDelete && (
            <button type="button" className="button ghost danger-text footer-start" onClick={() => onDelete(passenger)}>
              Delete passenger
            </button>
          )}
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="button">
            {passenger ? 'Save changes' : 'Add passenger'}
          </button>
        </>
      }
    >
      {/* Keyed so reopening for someone else starts from their details. */}
      <PassengerForm key={passenger?.id ?? 'new'} id={formId} passenger={passenger} onSave={onSave} />
    </Dialog>
  )
}

function PassengerForm({
  id,
  passenger,
  onSave,
}: {
  id: string
  passenger?: Passenger
  onSave: (passenger: Passenger) => void
}) {
  const [name, setName] = useState(passenger?.name ?? '')
  const [age, setAge] = useState(passenger ? String(passenger.age) : '')
  const [gender, setGender] = useState<Gender>(passenger?.gender ?? 'Male')
  const [berthPreference, setBerthPreference] = useState<BerthPreference>(passenger?.berthPreference ?? 'None')
  const [foodChoice, setFoodChoice] = useState<FoodChoice>(passenger?.foodChoice ?? 'No food')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // React passes events up through portals, so keep this from also submitting a form the dialog was opened from.
    event.stopPropagation()
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
    <form id={id} className="form-grid" onSubmit={submit}>
      <label className="field span-2">
        <span>Name as on ID</span>
        <input
          required
          data-autofocus
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Age</span>
        <input required type="number" min="0" max="125" value={age} onChange={(event) => setAge(event.target.value)} />
      </label>
      <div className="field span-3">
        <span>Gender</span>
        <Segmented label="Gender" options={GENDERS} value={gender} onChange={setGender} />
      </div>
      <div className="field span-3">
        <span>Berth preference</span>
        <ChoiceChips
          label="Berth preference"
          options={BERTH_PREFERENCES}
          value={berthPreference}
          onChange={setBerthPreference}
        />
      </div>
      <div className="field span-3">
        <span>Food</span>
        <Segmented label="Food" options={FOOD_CHOICES} value={foodChoice} onChange={setFoodChoice} />
      </div>
    </form>
  )
}
