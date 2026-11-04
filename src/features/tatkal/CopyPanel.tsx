import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Journey, Passenger } from '../../core/types'
import { UnlockPrompt } from '../logins/UnlockPrompt'
import { pickLogin, useVault } from '../logins/VaultProvider'
import { copySecret, copyText } from '../../platform/clipboard'
import { Icon } from '../../ui/Icon'
import { Panel } from '../../ui/layout'

/** A value to click and paste. A secret one shows as dots and is wiped from the clipboard after a while. */
export function CopyRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await (secret ? copySecret : copyText)(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      className={`copy-row${copied ? ' copied' : ''}`}
      onClick={copy}
      title={`Copy ${label.toLowerCase()}`}
    >
      <small>{label}</small>
      <span className={secret ? 'secret' : undefined}>{secret ? '•'.repeat(Math.min(value.length, 12)) : value}</span>
      <Icon name={copied ? 'check' : 'copy'} size={16} />
    </button>
  )
}

/** The IRCTC login a task books with: the one it names, or the default. Practice shows a made-up one. */
export function LoginCopyRows({ loginId, practice = false }: { loginId?: string; practice?: boolean }) {
  const vault = useVault()

  if (practice) {
    return (
      <div className="copy-group">
        <small className="copy-group-label">IRCTC login · sample</small>
        <CopyRow label="Username" value="practice_user" />
        <CopyRow label="Password" value="practice-password" secret />
      </div>
    )
  }
  if (vault.status === 'loading') return null
  if (vault.status === 'locked') return <UnlockPrompt compact />
  const login = pickLogin(vault.logins, loginId)
  if (!login) {
    return (
      <p className="copy-hint muted">
        <Link to="/settings#profile">Save your IRCTC login</Link> to copy it from here.
      </p>
    )
  }
  return (
    <div className="copy-group">
      <small className="copy-group-label">IRCTC login · {login.label}</small>
      <CopyRow label="Username" value={login.username} />
      {login.password && <CopyRow label="Password" value={login.password} secret />}
    </div>
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
    const details = [
      passenger.gender,
      passenger.berthPreference === 'None' ? 'Any berth' : `${passenger.berthPreference} berth`,
    ]
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

export function CopyPanel({ journey, passengers }: { journey: Journey; passengers: Passenger[] }) {
  const mobile = journey.preferences?.mobile

  return (
    <Panel title="Copy panel" description="Click a value to copy it, then paste it on the official site">
      <div className="copy-list">
        <LoginCopyRows loginId={journey.loginId} />
        <JourneyCopyRows journey={journey} />
        <PassengerCopyRows passengers={passengers} />
        {mobile && <CopyRow label="Mobile" value={mobile} />}
      </div>
    </Panel>
  )
}
