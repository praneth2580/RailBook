import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { journeyCollection, passengerCollection } from '../../core/collections'
import { formatJourneyDate, formatWindow, todayIso } from '../../core/format'
import { useSettings } from '../../core/settings'
import { useCollection } from '../../core/storage'
import {
  CLASS_NAMES,
  PAYMENT_METHODS,
  QUOTAS,
  TRAVEL_CLASSES,
  type BookingPreferences,
  type Journey,
  type Passenger,
  type PaymentMethod,
  type Quota,
  type TravelClass,
} from '../../core/types'
import { useTrainName } from '../../data/useTrainName'
import { ChoiceChips, Segmented, Switch } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { Avatar, Keys, Notice, Panel, useDocumentTitle } from '../../ui/layout'
import { MOD_KEY, useShortcut } from '../../ui/shortcuts'
import { useToast } from '../../ui/toast'
import { PassengerDialog, describePassenger } from '../passengers/PassengerDialog'
import { bookingOpensAt } from '../tatkal/tatkalWindow'
import { Facts, PAYMENT_DETAILS, RouteLine } from './TaskParts'
import { passengerLimit } from './tasks'

const STEPS = [
  {
    label: 'Journey',
    hint: 'Route, date and train',
    title: 'Where and when?',
    description: 'The route, date, class and train you want to book.',
  },
  {
    label: 'Passengers',
    hint: "Who's travelling",
    title: "Who's travelling?",
    description: 'Pick from your master list, or add someone new.',
  },
  {
    label: 'Preferences',
    hint: 'Upgrades, berths, insurance',
    title: 'Booking preferences',
    description: 'Reminders of what to tick on the official site.',
  },
  {
    label: 'Payment',
    hint: "How you'll pay",
    title: 'How will you pay?',
    description: 'RailBook reminds you which method to pick when it’s time.',
  },
  {
    label: 'Review',
    hint: 'Check and save',
    title: 'Check and save',
    description: 'Make sure everything is right before you save the task.',
  },
] as const

interface TaskForm {
  from: string
  to: string
  boardingStation: string
  date: string
  trainNumber: string
  backupTrainNumber: string
  travelClass: TravelClass
  quota: Quota
  passengerIds: string[]
  preferences: BookingPreferences
  paymentMethod: PaymentMethod
}

function initialForm(journey: Journey | undefined, passengers: Passenger[], mobile: string): TaskForm {
  return {
    from: journey?.from ?? '',
    to: journey?.to ?? '',
    boardingStation: journey?.boardingStation ?? '',
    date: journey?.date ?? '',
    trainNumber: journey?.trainNumber ?? '',
    backupTrainNumber: journey?.backupTrainNumber ?? '',
    travelClass: journey?.travelClass ?? '3A',
    quota: journey?.quota ?? 'Tatkal',
    // Passengers deleted since the task was saved would otherwise count towards the limit.
    passengerIds: (journey?.passengerIds ?? []).filter((id) => passengers.some((passenger) => passenger.id === id)),
    preferences: journey?.preferences ?? {
      autoUpgrade: true,
      confirmedBerthsOnly: false,
      travelInsurance: false,
      mobile,
    },
    paymentMethod: journey?.paymentMethod ?? 'UPI',
  }
}

export function TaskWizardPage() {
  const { id } = useParams()
  const { items: journeys, loaded, save } = useCollection(journeyCollection)
  const { items: passengers, loaded: passengersLoaded, save: savePassenger } = useCollection(passengerCollection)
  const { settings } = useSettings()

  if (!loaded || !passengersLoaded) return null
  const existing = id ? journeys.find((journey) => journey.id === id) : undefined
  if (id && !existing) return <Navigate to="/tasks" replace />

  return (
    <Wizard
      existing={existing}
      passengers={passengers}
      defaultMobile={settings.profile.mobile}
      onSave={save}
      onSavePassenger={savePassenger}
    />
  )
}

function stepSummaries(form: TaskForm, passengers: Passenger[]) {
  const names = passengers.filter(({ id }) => form.passengerIds.includes(id)).map(({ name }) => name.split(' ')[0])
  const extras = [
    form.preferences.autoUpgrade && 'Auto-upgrade',
    form.preferences.confirmedBerthsOnly && 'Confirmed only',
    form.preferences.travelInsurance && 'Insurance',
  ].filter(Boolean)

  return [
    form.from && form.to
      ? `${form.from} → ${form.to}${form.date ? ` · ${formatJourneyDate(form.date)}` : ''}`
      : 'Route, date and train',
    names.length > 0
      ? `${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`
      : 'Pick passengers',
    extras.length > 0 ? extras.join(', ') : 'No extras',
    form.paymentMethod,
    'Check and save',
  ]
}

function Wizard({
  existing,
  passengers,
  defaultMobile,
  onSave,
  onSavePassenger,
}: {
  existing: Journey | undefined
  passengers: Passenger[]
  defaultMobile: string
  onSave: (journey: Journey) => Promise<void>
  onSavePassenger: (passenger: Passenger) => Promise<void>
}) {
  const navigate = useNavigate()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  // Edits can jump to any step; a new task opens steps as it reaches them.
  const [furthest, setFurthest] = useState(existing ? STEPS.length - 1 : 0)
  const [form, setForm] = useState(() => initialForm(existing, passengers, defaultMobile))
  const update = (patch: Partial<TaskForm>) => setForm((current) => ({ ...current, ...patch }))
  useDocumentTitle(existing ? 'Edit booking task' : 'New booking task')
  useShortcut('Enter', () => formRef.current?.requestSubmit(), { mod: true })

  const goTo = (index: number) => {
    // Moving forward from the rail still has to pass this step's checks.
    if (index > step && !formRef.current?.reportValidity()) return
    setStep(index)
    setFurthest((current) => Math.max(current, index))
    window.scrollTo(0, 0)
  }
  const cancel = () => navigate(existing ? `/tasks/${existing.id}` : '/tasks')
  const back = () => (step === 0 ? cancel() : goTo(step - 1))
  const last = step === STEPS.length - 1
  const canContinue = STEPS[step]?.label !== 'Passengers' || form.passengerIds.length > 0
  const summaries = stepSummaries(form, passengers)
  const current = STEPS[step] ?? STEPS[0]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canContinue) return
    if (!last) {
      goTo(step + 1)
      return
    }
    const journey: Journey = {
      ...existing,
      ...form,
      id: existing?.id ?? crypto.randomUUID(),
      confirmedChecks: existing?.confirmedChecks ?? [],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    await onSave(journey)
    toast(existing ? 'Task saved' : `Created ${journey.from} → ${journey.to}`)
    navigate(`/tasks/${journey.id}`, { replace: true })
  }

  return (
    <form ref={formRef} className="focus-layout wizard" onSubmit={submit}>
      <header className="focus-header">
        <span className="brand-mark">
          <Icon name="train" size={18} />
        </span>
        <div className="focus-title">
          <h1>{existing ? 'Edit booking task' : 'New booking task'}</h1>
          <small className="muted">{existing ? `${existing.from} → ${existing.to}` : 'Five short steps'}</small>
        </div>
        <button type="button" className="button ghost" onClick={cancel}>
          Cancel
        </button>
      </header>

      <div className="wizard-body">
        <nav className="wizard-rail" aria-label="Steps">
          <ol>
            {STEPS.map(({ label, hint }, index) => {
              const state = index === step ? 'current' : index <= furthest ? 'visited' : 'upcoming'
              return (
                <li key={label} className={state}>
                  <button
                    type="button"
                    disabled={index > furthest}
                    aria-current={index === step ? 'step' : undefined}
                    onClick={() => goTo(index)}
                  >
                    <span className="step-number">
                      {state === 'visited' ? <Icon name="check" size={14} /> : index + 1}
                    </span>
                    <span className="list-text">
                      <strong>{label}</strong>
                      <small>{index <= furthest ? summaries[index] : hint}</small>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
          {form.date && (
            <div className="rail-note">
              <Icon name="clock" size={16} />
              <span>
                Booking opens
                <strong>{formatWindow(bookingOpensAt(form.date, form.travelClass, form.quota))}</strong>
              </span>
            </div>
          )}
        </nav>

        <div className="wizard-content">
          <div className="step-heading">
            <small className="muted">
              Step {step + 1} of {STEPS.length}
            </small>
            <h2>{current.title}</h2>
            <p className="muted">{current.description}</p>
          </div>

          {step === 0 && <JourneyStep form={form} update={update} isNew={!existing} />}
          {step === 1 && (
            <PassengersStep form={form} update={update} passengers={passengers} onSavePassenger={onSavePassenger} />
          )}
          {step === 2 && <PreferencesStep form={form} update={update} />}
          {step === 3 && <PaymentStep form={form} update={update} />}
          {step === 4 && <ReviewStep form={form} passengers={passengers} goTo={goTo} />}
        </div>
      </div>

      <footer className="focus-footer">
        <span className="muted footer-hint">
          <Keys keys={[MOD_KEY, 'Enter']} /> {last ? 'to save' : 'to continue'}
        </span>
        {step > 0 && (
          <button type="button" className="button secondary" onClick={back}>
            Back
          </button>
        )}
        <button type="submit" className="button" disabled={!canContinue}>
          {last ? (existing ? 'Save changes' : 'Create task') : 'Continue'}
          {!last && <Icon name="arrow" size={16} />}
        </button>
      </footer>
    </form>
  )
}

interface StepProps {
  form: TaskForm
  update: (patch: Partial<TaskForm>) => void
}

function Optional() {
  return <em>Optional</em>
}

function JourneyStep({ form, update, isNew }: StepProps & { isNew: boolean }) {
  const trainName = useTrainName(form.trainNumber)

  return (
    <>
      <Panel title="Route and date">
        <div className="route-inputs">
          <label className="field">
            <span>From</span>
            <input
              required
              autoFocus
              placeholder="e.g. NDLS"
              value={form.from}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="icon-button swap-button"
            aria-label="Swap stations"
            title="Swap stations"
            onClick={() => update({ from: form.to, to: form.from })}
          >
            <Icon name="swap" size={18} />
          </button>
          <label className="field">
            <span>To</span>
            <input
              required
              placeholder="e.g. MMCT"
              value={form.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Departure date from the train's origin</span>
            <input
              required
              type="date"
              min={isNew ? todayIso() : undefined}
              value={form.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </label>
        </div>
      </Panel>

      <Panel title="Quota and class">
        <div className="field">
          <span>Quota</span>
          <Segmented
            label="Quota"
            options={QUOTAS}
            value={form.quota}
            onChange={(quota) => update({ quota, passengerIds: form.passengerIds.slice(0, passengerLimit(quota)) })}
          />
        </div>
        <div className="field">
          <span>Class</span>
          <ChoiceChips
            label="Class"
            options={TRAVEL_CLASSES}
            value={form.travelClass}
            onChange={(travelClass) => update({ travelClass })}
            describe={(option) => CLASS_NAMES[option]}
          />
        </div>
      </Panel>

      <Panel title="Train">
        <div className="form-grid three">
          <label className="field">
            <span>Train number</span>
            <input
              required
              inputMode="numeric"
              pattern="\d{5}"
              title="A 5-digit train number"
              placeholder="e.g. 12952"
              value={form.trainNumber}
              onChange={(event) => update({ trainNumber: event.target.value.trim() })}
            />
            {trainName && <small>{trainName}</small>}
          </label>
          <label className="field">
            <span>
              Backup train <Optional />
            </span>
            <input
              inputMode="numeric"
              pattern="\d{5}"
              title="A 5-digit train number"
              value={form.backupTrainNumber}
              onChange={(event) => update({ backupTrainNumber: event.target.value.trim() })}
            />
          </label>
          <label className="field">
            <span>
              Boarding station <Optional />
            </span>
            <input value={form.boardingStation} onChange={(event) => update({ boardingStation: event.target.value })} />
          </label>
        </div>
      </Panel>
    </>
  )
}

function PassengersStep({
  form,
  update,
  passengers,
  onSavePassenger,
}: StepProps & { passengers: Passenger[]; onSavePassenger: (passenger: Passenger) => Promise<void> }) {
  const [adding, setAdding] = useState(false)
  const limit = passengerLimit(form.quota)
  const selected = form.passengerIds

  const toggle = (id: string) =>
    update({ passengerIds: selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id] })

  const addPassenger = async (passenger: Passenger) => {
    await onSavePassenger(passenger)
    if (selected.length < limit) update({ passengerIds: [...selected, passenger.id] })
    setAdding(false)
  }

  return (
    <>
      <div className="picker-status">
        <strong>
          {selected.length} of {limit} selected
        </strong>
        <span className="muted">
          {form.quota} allows {limit} passengers per ticket
        </span>
      </div>

      <div className="pick-grid">
        {passengers.map((passenger) => {
          const isSelected = selected.includes(passenger.id)
          return (
            <label key={passenger.id} className={`pick-card${isSelected ? ' selected' : ''}`}>
              <input
                type="checkbox"
                checked={isSelected}
                disabled={!isSelected && selected.length >= limit}
                onChange={() => toggle(passenger.id)}
              />
              <Avatar id={passenger.id} name={passenger.name} />
              <span className="list-text">
                <strong>{passenger.name}</strong>
                <small>{describePassenger(passenger)}</small>
              </span>
              <span className="check-box">
                <Icon name="check" size={14} />
              </span>
            </label>
          )
        })}
        <button type="button" className="pick-card add" onClick={() => setAdding(true)}>
          <span className="option-icon">
            <Icon name="plus" size={18} />
          </span>
          <span className="list-text">
            <strong>Add passenger</strong>
            <small>Saved to your master list too</small>
          </span>
        </button>
      </div>

      {passengers.length === 0 && (
        <Notice icon="users">Your master list is empty. Add the first passenger to continue.</Notice>
      )}
      <PassengerDialog open={adding} onClose={() => setAdding(false)} onSave={addPassenger} />
    </>
  )
}

function PreferencesStep({ form, update }: StepProps) {
  const setPreference = (patch: Partial<BookingPreferences>) =>
    update({ preferences: { ...form.preferences, ...patch } })

  return (
    <>
      <Panel title="On the booking form">
        <div className="switch-list">
          <Switch
            label="Auto-upgrade"
            description="Accept a higher class at no extra fare if it's offered"
            checked={form.preferences.autoUpgrade}
            onChange={(autoUpgrade) => setPreference({ autoUpgrade })}
          />
          <Switch
            label="Confirmed berths only"
            description="Book only if every passenger gets a confirmed berth"
            checked={form.preferences.confirmedBerthsOnly}
            onChange={(confirmedBerthsOnly) => setPreference({ confirmedBerthsOnly })}
          />
          <Switch
            label="Travel insurance"
            description="Opt in to travel insurance for each passenger"
            checked={form.preferences.travelInsurance}
            onChange={(travelInsurance) => setPreference({ travelInsurance })}
          />
        </div>
      </Panel>
      <Panel title="Ticket delivery">
        <label className="field narrow">
          <span>Mobile number for the ticket</span>
          <input
            type="tel"
            pattern="[6-9]\d{9}"
            title="A 10-digit Indian mobile number"
            placeholder="10-digit mobile number"
            value={form.preferences.mobile}
            onChange={(event) => setPreference({ mobile: event.target.value.trim() })}
          />
        </label>
      </Panel>
      <Notice>
        These are reminders of what to choose on the official site. RailBook doesn't submit them anywhere.
      </Notice>
    </>
  )
}

function PaymentStep({ form, update }: StepProps) {
  return (
    <>
      <div className="option-grid" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((method) => {
          const { icon, detail } = PAYMENT_DETAILS[method]
          const isSelected = form.paymentMethod === method
          return (
            <label key={method} className={`option-card${isSelected ? ' selected' : ''}`}>
              <input
                type="radio"
                name="payment-method"
                checked={isSelected}
                onChange={() => update({ paymentMethod: method })}
              />
              <span className="option-icon">
                <Icon name={icon} size={18} />
              </span>
              <span className="list-text">
                <strong>{method}</strong>
                <small>{detail}</small>
              </span>
              <span className="radio-dot" />
            </label>
          )
        })}
      </div>
      <Notice icon="lock">
        RailBook only remembers which method you prefer. Card numbers, CVV and UPI PIN are entered on the official page,
        never here.
      </Notice>
    </>
  )
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <Panel
      title={title}
      actions={
        <button type="button" className="text-button" onClick={onEdit}>
          Edit
        </button>
      }
    >
      {children}
    </Panel>
  )
}

function ReviewStep({
  form,
  passengers,
  goTo,
}: {
  form: TaskForm
  passengers: Passenger[]
  goTo: (step: number) => void
}) {
  const trainName = useTrainName(form.trainNumber)
  const chosen = passengers.filter(({ id }) => form.passengerIds.includes(id))
  const { autoUpgrade, confirmedBerthsOnly, travelInsurance, mobile } = form.preferences
  const preferences = [
    autoUpgrade && 'Auto-upgrade',
    confirmedBerthsOnly && 'Confirmed berths only',
    travelInsurance && 'Travel insurance',
  ].filter((label) => label !== false)

  return (
    <div className="review-grid">
      <ReviewSection title="Journey" onEdit={() => goTo(0)}>
        <RouteLine from={form.from} to={form.to} />
        <Facts
          items={[
            ['Date', formatJourneyDate(form.date)],
            ['Train', trainName ? `${form.trainNumber} · ${trainName}` : form.trainNumber],
            ['Class', `${form.travelClass} · ${CLASS_NAMES[form.travelClass]}`],
            ['Quota', form.quota],
            ['Backup train', form.backupTrainNumber || 'None'],
            ['Boarding', form.boardingStation || 'Same as From'],
          ]}
        />
      </ReviewSection>
      <ReviewSection title={`Passengers · ${chosen.length}`} onEdit={() => goTo(1)}>
        <ul className="mini-list">
          {chosen.map((passenger) => (
            <li key={passenger.id}>
              <Avatar id={passenger.id} name={passenger.name} size={28} />
              <span className="list-text">
                <strong>{passenger.name}</strong>
                <small>{describePassenger(passenger)}</small>
              </span>
            </li>
          ))}
        </ul>
      </ReviewSection>
      <ReviewSection title="Preferences" onEdit={() => goTo(2)}>
        <div className="pills">
          {preferences.length === 0 ? (
            <span className="pill">No extras</span>
          ) : (
            preferences.map((label) => (
              <span key={label} className="pill">
                {label}
              </span>
            ))
          )}
          {mobile && <span className="pill">Ticket to {mobile}</span>}
        </div>
      </ReviewSection>
      <ReviewSection title="Payment" onEdit={() => goTo(3)}>
        <div className="card-row">
          <span className="option-icon">
            <Icon name={PAYMENT_DETAILS[form.paymentMethod].icon} size={18} />
          </span>
          <span className="list-text">
            <strong>{form.paymentMethod}</strong>
            <small>{PAYMENT_DETAILS[form.paymentMethod].detail}</small>
          </span>
        </div>
      </ReviewSection>
    </div>
  )
}
