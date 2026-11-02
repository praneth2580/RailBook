import { useState } from 'react'
import type { Journey, Passenger } from '../../core/types'
import { copyText } from '../../platform/clipboard'
import { Icon } from '../../ui/Icon'
import { SectionHead } from '../../ui/layout'

export function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await copyText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button type="button" className={`copy-row${copied ? ' copied' : ''}`} onClick={copy}>
      <small>{label}</small>
      <span>{value}</span>
      <Icon name={copied ? 'check' : 'copy'} size={16} />
    </button>
  )
}

export function JourneyCopyRows({ journey }: { journey: Journey }) {
  return (
    <>
      <CopyRow label="From" value={journey.from} />
      <CopyRow label="To" value={journey.to} />
      <CopyRow label="Train" value={journey.trainNumber} />
      {journey.backupTrainNumber && <CopyRow label="Backup train" value={journey.backupTrainNumber} />}
      {journey.boardingStation && <CopyRow label="Boarding station" value={journey.boardingStation} />}
    </>
  )
}

export function PassengerCopyRows({ passengers }: { passengers: Passenger[] }) {
  return passengers.map((passenger, index) => {
    const details = [passenger.gender, passenger.berthPreference === 'None' ? 'Any berth' : `${passenger.berthPreference} berth`]
    if (passenger.foodChoice && passenger.foodChoice !== 'No food') details.push(passenger.foodChoice)

    return (
      <div key={passenger.id} className="copy-group">
        <small className="copy-group-label">
          Passenger {index + 1} · {details.join(' · ')}
        </small>
        <CopyRow label="Name" value={passenger.name} />
        <CopyRow label="Age" value={String(passenger.age)} />
      </div>
    )
  })
}

export function CopyPanel({
  journey,
  passengers,
  username,
}: {
  journey: Journey
  passengers: Passenger[]
  username: string
}) {
  const mobile = journey.preferences?.mobile

  return (
    <section className="card">
      <SectionHead title="Copy panel" action={<small className="muted">Click to copy</small>} />
      {username && <CopyRow label="IRCTC username" value={username} />}
      <JourneyCopyRows journey={journey} />
      <PassengerCopyRows passengers={passengers} />
      {mobile && <CopyRow label="Mobile" value={mobile} />}
    </section>
  )
}
