import { useState } from 'react'
import { Icon } from '../../ui/Icon'
import { useVault } from './VaultProvider'

/**
 * Asks for the master password wherever logins are needed. It isn't a form, because it sits inside other forms, such
 * as the task wizard, so Enter is handled here and kept from submitting them.
 */
export function UnlockPrompt({ compact = false }: { compact?: boolean }) {
  const { unlock, count } = useVault()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await unlock(password)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`unlock${compact ? ' compact' : ''}`}>
      <span className="unlock-label">
        <Icon name="lock" size={16} />
        {count === 1 ? '1 IRCTC login is locked' : `${count} IRCTC logins are locked`}
      </span>
      <div className="unlock-row">
        <input
          type="password"
          aria-label="Master password"
          placeholder="Master password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            event.stopPropagation()
            void submit()
          }}
        />
        <button type="button" className="button small" disabled={!password || busy} onClick={() => void submit()}>
          {busy ? 'Unlocking…' : 'Unlock'}
        </button>
      </div>
      {error && <small className="error">{error}</small>}
    </div>
  )
}
