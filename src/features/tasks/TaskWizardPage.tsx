import { useState, type FormEvent, type ReactNode } from 'react'
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
import { Avatar, Notice, PageHeader } from '../../ui/layout'
import { PassengerSheet, describePassenger } from '../passengers/PassengerSheet'
import { bookingOpensAt } from '../tatkal/tatkalWindow'
import { Facts, PAYMENT_DETAILS, RouteLine } from './TaskParts'
import { passengerLimit } from './tasks'

const STEPS = ['Journey', 'Passengers', 'Preferences', 'Payment', 'Review'] as const

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
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(() => initialForm(existing, passengers, defaultMobile))
  const update = (patch: Partial<TaskForm>) => setForm((current) => ({ ...current, ...patch }))

  const goTo = (index: number) => {
    setStep(index)
    window.scrollTo(0, 0)
  }
  const back = () => (step === 0 ? navigate(existing ? `/tasks/${existing.id}` : '/tasks') : goTo(step - 1))
  const last = step === STEPS.length - 1
  const canContinue = STEPS[step] !== 'Passengers' || form.passengerIds.length > 0

  const submit = async (event: FormEvent) => {
    event.preventDefault()
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
    navigate(`/tasks/${journey.id}`, { replace: true })
  }

  return (
    <form className="wizard" onSubmit={submit}>
      <PageHeader
        title={existing ? 'Edit booking task' : 'New booking task'}
        subtitle={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
        back={back}
      />
      <ol className="stepper" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={index < step ? 'done' : index === step ? 'current' : undefined}
            aria-current={index === step ? 'step' : undefined}
          >
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && <JourneyStep form={form} update={update} isNew={!existing} />}
      {step === 1 && (
        <PassengersStep form={form} update={update} passengers={passengers} onSavePassenger={onSavePassenger} />
      )}
      {step === 2 && <PreferencesStep form={form} update={update} />}
      {step === 3 && <PaymentStep form={form} update={update} />}
      {step === 4 && <ReviewStep form={form} passengers={passengers} goTo={goTo} />}

      <div className="wizard-footer">
        <button type="button" className="button secondary" onClick={back}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button type="submit" className="button" disabled={!canContinue}>
          {last ? (existing ? 'Save changes' : 'Create task') : 'Continue'}
        </button>
      </div>
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
      <section className="card stack">
        <div className="route-inputs">
          <label className="field">
            <span>From</span>
            <input required placeholder="e.g. NDLS" value={form.from} onChange={(event) => update({ from: event.target.value })} />
          </label>
          <button
            type="button"
            className="icon-button swap-button"
            aria-label="Swap stations"
            onClick={() => update({ from: form.to, to: form.from })}
          >
            <Icon name="swap" />
          </button>
          <label className="field">
            <span>To</span>
            <input required placeholder="e.g. MMCT" value={form.to} onChange={(event) => update({ to: event.target.value })} />
          </label>
        </div>
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
      </section>

      <section className="card stack">
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
      </section>

      <section className="card stack">
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
            Backup train number <Optional />
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
      </section>

      {form.date && (
        <Notice icon="clock">
          Booking opens <strong>{formatWindow(bookingOpensAt(form.date, form.travelClass, form.quota))}</strong>
        </Notice>
      )}
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
      <div className="step-intro">
        <h2>Who's travelling?</h2>
        <small className="muted">
          {selected.length} of {limit} selected · {form.quota} allows {limit} per ticket
        </small>
      </div>

      {passengers.length === 0 ? (
        <Notice icon="users">Your master list is empty. Add the first passenger to continue.</Notice>
      ) : (
        <ul className="list">
          {passengers.map((passenger) => {
            const isSelected = selected.includes(passenger.id)
            return (
              <li key={passenger.id}>
                <label className={`list-row selectable${isSelected ? ' selected' : ''}`}>
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
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="button secondary" onClick={() => setAdding(true)}>
        <Icon name="plus" />
        Add new passenger
      </button>
      <PassengerSheet open={adding} onClose={() => setAdding(false)} onSave={addPassenger} />
    </>
  )
}

function PreferencesStep({ form, update }: StepProps) {
  const setPreference = (patch: Partial<BookingPreferences>) =>
    update({ preferences: { ...form.preferences, ...patch } })

  return (
    <>
      <section className="card switch-list">
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
      </section>
      <section className="card stack">
        <label className="field">
          <span>Mobile number for the ticket</span>
          <input
            type="tel"
            inputMode="tel"
            pattern="[6-9]\d{9}"
            title="A 10-digit Indian mobile number"
            placeholder="10-digit mobile number"
            value={form.preferences.mobile}
            onChange={(event) => setPreference({ mobile: event.target.value.trim() })}
          />
        </label>
      </section>
      <Notice>These are reminders of what to choose on the official site. RailBook doesn't submit them anywhere.</Notice>
    </>
  )
}

function PaymentStep({ form, update }: StepProps) {
  return (
    <>
      <div className="step-intro">
        <h2>How will you pay?</h2>
        <small className="muted">RailBook reminds you which method to pick when it's time.</small>
      </div>
      <div className="option-list" role="radiogroup" aria-label="Payment method">
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
                <Icon name={icon} />
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
        RailBook only remembers which method you prefer. Card numbers, CVV and UPI PIN are entered on the official
        page, never here.
      </Notice>
    </>
  )
}

function ReviewSection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="card">
      <div className="section-head">
        <h2>{title}</h2>
        <button type="button" className="text-button" onClick={onEdit}>
          Edit
        </button>
      </div>
      {children}
    </section>
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
    <>
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
      <ReviewSection title={`Passengers (${chosen.length})`} onEdit={() => goTo(1)}>
        <ul className="mini-list">
          {chosen.map((passenger) => (
            <li key={passenger.id}>
              <Avatar id={passenger.id} name={passenger.name} />
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
          {preferences.length === 0 ? <span className="pill">No extras</span> : preferences.map((label) => <span key={label} className="pill">{label}</span>)}
          {mobile && <span className="pill">Ticket to {mobile}</span>}
        </div>
      </ReviewSection>
      <ReviewSection title="Payment" onEdit={() => goTo(3)}>
        <div className="card-row">
          <span className="option-icon">
            <Icon name={PAYMENT_DETAILS[form.paymentMethod].icon} />
          </span>
          <span className="list-text">
            <strong>{form.paymentMethod}</strong>
            <small>{PAYMENT_DETAILS[form.paymentMethod].detail}</small>
          </span>
        </div>
      </ReviewSection>
      <Notice icon="clock">
        Booking opens <strong>{formatWindow(bookingOpensAt(form.date, form.travelClass, form.quota))}</strong>
      </Notice>
    </>
  )
}
