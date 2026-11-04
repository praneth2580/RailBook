import { UnlockPrompt } from './UnlockPrompt'
import { pickLogin, useVault } from './VaultProvider'

/** Chooses the IRCTC login a task books with. Left alone, the task follows whichever login is the default. */
export function LoginPicker({ value, onChange }: { value?: string; onChange: (loginId: string) => void }) {
  const vault = useVault()

  if (vault.status === 'loading') return null
  if (vault.status === 'locked') {
    return (
      <>
        <UnlockPrompt compact />
        <small className="muted">Unlock to choose a login. Otherwise the task uses your default one.</small>
      </>
    )
  }
  if (vault.logins.length === 0) {
    return <small className="muted">No IRCTC logins saved yet. Add them in Settings, then pick one here.</small>
  }
  const selected = pickLogin(vault.logins, value)
  return (
    <label className="field narrow">
      <span>Book with</span>
      <select value={selected?.id} onChange={(event) => onChange(event.target.value)}>
        {vault.logins.map((login) => (
          <option key={login.id} value={login.id}>
            {login.label} · {login.username}
            {login.isDefault ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
