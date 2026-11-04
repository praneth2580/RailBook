import { useId, useState, type FormEvent } from 'react'
import type { IrctcLogin } from '../../core/types'
import { copySecret } from '../../platform/clipboard'
import { Icon } from '../../ui/Icon'
import { Avatar, ConfirmDialog, Dialog, Notice, StatusChip } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { SecretInput } from './SecretInput'
import { UnlockPrompt } from './UnlockPrompt'
import { MIN_PASSWORD_LENGTH } from './vault'
import { AUTO_LOCK_MINUTES, useVault } from './VaultProvider'

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function CreateVault() {
  const { create } = useVault()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirm) return setError("The two passwords don't match.")
    setBusy(true)
    try {
      await create(password)
      toast('Master password set. Save your IRCTC username and password in Profile.')
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <Notice icon="key">
        Choose a master password to encrypt your logins. RailBook never saves it, so if you forget it the logins can't
        be recovered, only deleted.
      </Notice>
      <div className="form-grid two">
        <SecretInput
          label="Master password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
        />
        <SecretInput label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
      </div>
      <small className="muted">At least {MIN_PASSWORD_LENGTH} characters. Use one you don't use anywhere else.</small>
      {error && <small className="error">{error}</small>}
      <div className="form-actions">
        <button type="submit" className="button" disabled={busy}>
          <Icon name="lock" size={16} />
          {busy ? 'Encrypting…' : 'Set master password'}
        </button>
      </div>
    </form>
  )
}

function LoginRow({
  login,
  onEdit,
  onDelete,
  onMakeDefault,
}: {
  login: IrctcLogin
  onEdit: () => void
  onDelete: () => void
  onMakeDefault: () => void
}) {
  const toast = useToast()
  const [shown, setShown] = useState(false)
  const contact = [login.mobile, login.email].filter(Boolean).join(' · ')

  return (
    <li className="login-row">
      <Avatar id={login.id} name={login.label} size={36} />
      <div className="login-main">
        <strong>
          {login.label}
          {login.isDefault && <StatusChip tone="info">Default</StatusChip>}
        </strong>
        <span className="mono">{login.username}</span>
        <small className="muted">{contact || 'No registered mobile or email saved'}</small>
      </div>
      <div className="login-secret">
        {login.password ? (
          <>
            <span className="mono">{shown ? login.password : '••••••••'}</span>
            <button
              type="button"
              className="icon-button"
              aria-label={shown ? 'Hide password' : 'Show password'}
              title={shown ? 'Hide password' : 'Show password'}
              onClick={() => setShown(!shown)}
            >
              <Icon name={shown ? 'eyeOff' : 'eye'} size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Copy password"
              title="Copy password"
              onClick={async () => {
                await copySecret(login.password)
                toast('Password copied. It clears from the clipboard after 30 seconds.')
              }}
            >
              <Icon name="copy" size={16} />
            </button>
          </>
        ) : (
          <small className="muted">No password saved</small>
        )}
      </div>
      <div className="login-actions">
        {!login.isDefault && (
          <button type="button" className="text-button" onClick={onMakeDefault}>
            Make default
          </button>
        )}
        <button type="button" className="icon-button" aria-label={`Edit ${login.label}`} title="Edit" onClick={onEdit}>
          <Icon name="edit" size={16} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Delete ${login.label}`}
          title="Delete"
          onClick={onDelete}
        >
          <Icon name="trash" size={16} />
        </button>
      </div>
    </li>
  )
}

function LoginDialog({
  open,
  login,
  first,
  onClose,
}: {
  open: boolean
  login?: IrctcLogin
  /** The first login becomes the default. */
  first: boolean
  onClose: () => void
}) {
  const formId = useId()
  return (
    <Dialog
      open={open}
      title={login ? 'Edit IRCTC login' : 'Add IRCTC login'}
      description="Saved encrypted on this computer. RailBook copies it for you to paste on the official site; it never signs in for you."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={formId} className="button">
            {login ? 'Save changes' : 'Add login'}
          </button>
        </>
      }
    >
      <LoginForm key={login?.id ?? 'new'} id={formId} login={login} first={first} onDone={onClose} />
    </Dialog>
  )
}

function LoginForm({
  id,
  login,
  first,
  onDone,
}: {
  id: string
  login?: IrctcLogin
  first: boolean
  onDone: () => void
}) {
  const { save } = useVault()
  const toast = useToast()
  const [draft, setDraft] = useState<IrctcLogin>(
    () =>
      login ?? {
        id: crypto.randomUUID(),
        label: '',
        username: '',
        password: '',
        mobile: '',
        email: '',
        note: '',
        isDefault: first,
      },
  )
  const [error, setError] = useState('')
  const set = (patch: Partial<IrctcLogin>) => setDraft((current) => ({ ...current, ...patch }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await save({
        ...draft,
        label: draft.label.trim(),
        username: draft.username.trim(),
        mobile: draft.mobile.trim(),
        email: draft.email.trim(),
        note: draft.note.trim(),
      })
      toast(login ? `Saved ${draft.label.trim()}` : `Added ${draft.label.trim()}`)
      onDone()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <form id={id} className="form-grid two" onSubmit={submit}>
      <label className="field">
        <span>Whose account</span>
        <input
          required
          data-autofocus
          placeholder="e.g. Mine, Dad"
          autoComplete="off"
          value={draft.label}
          onChange={(event) => set({ label: event.target.value })}
        />
      </label>
      <label className="field">
        <span>IRCTC username</span>
        <input
          required
          autoComplete="off"
          spellCheck={false}
          value={draft.username}
          onChange={(event) => set({ username: event.target.value })}
        />
      </label>
      <div className="span-2">
        <SecretInput
          label="Password"
          value={draft.password}
          onChange={(password) => set({ password })}
          autoComplete="new-password"
        />
      </div>
      <label className="field">
        <span>
          Registered mobile <em>Optional</em>
        </span>
        <input
          type="tel"
          pattern="[6-9]\d{9}"
          title="A 10-digit Indian mobile number"
          value={draft.mobile}
          onChange={(event) => set({ mobile: event.target.value })}
        />
      </label>
      <label className="field">
        <span>
          Registered email <em>Optional</em>
        </span>
        <input type="email" value={draft.email} onChange={(event) => set({ email: event.target.value })} />
      </label>
      <label className="field span-2">
        <span>
          Note <em>Optional</em>
        </span>
        <input
          placeholder="e.g. Aadhaar-verified, for Tatkal"
          value={draft.note}
          onChange={(event) => set({ note: event.target.value })}
        />
      </label>
      <label className="check-field span-2">
        <input
          type="checkbox"
          checked={draft.isDefault}
          onChange={(event) => set({ isDefault: event.target.checked })}
        />
        Use this login for new tasks
      </label>
      {error && <small className="error span-2">{error}</small>}
    </form>
  )
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword } = useVault()
  const toast = useToast()
  const formId = useId()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const close = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== confirm) return setError("The two new passwords don't match.")
    setBusy(true)
    try {
      await changePassword(current, next)
      toast('Master password changed')
      close()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Change master password"
      description="Your logins are encrypted again under the new password."
      size="small"
      onClose={close}
      footer={
        <>
          <button type="button" className="button secondary" onClick={close}>
            Cancel
          </button>
          <button type="submit" form={formId} className="button" disabled={busy}>
            {busy ? 'Encrypting…' : 'Change password'}
          </button>
        </>
      }
    >
      <form id={formId} className="stack" onSubmit={submit}>
        <SecretInput
          label="Current master password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          required
          autoFocus
        />
        <SecretInput label="New master password" value={next} onChange={setNext} autoComplete="new-password" required />
        <SecretInput
          label="Type the new one again"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
        />
        {error && <small className="error">{error}</small>}
      </form>
    </Dialog>
  )
}

/** Settings › Master password: sets up, unlocks, changes and locks the vault that encrypts IRCTC logins. */
export function MasterPasswordSection() {
  const vault = useVault()
  const toast = useToast()
  const [changing, setChanging] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (vault.status === 'loading') return null
  if (vault.status === 'none') return <CreateVault />

  if (vault.status === 'locked') {
    return (
      <>
        <UnlockPrompt />
        <button type="button" className="text-button align-start" onClick={() => setResetting(true)}>
          Forgot the master password?
        </button>
        <ConfirmDialog
          open={resetting}
          title="Delete your saved logins?"
          body="Without the master password nobody can read them, RailBook included, so they can only be deleted. You can then set a new master password and add them again."
          confirmLabel="Delete saved logins"
          onConfirm={async () => {
            await vault.reset()
            setResetting(false)
            toast('Saved logins deleted')
          }}
          onClose={() => setResetting(false)}
        />
      </>
    )
  }

  return (
    <>
      <div className="vault-status">
        <Icon name="key" size={16} />
        <span className="list-text">
          <strong>Unlocked</strong>
          <small>Locks itself after {AUTO_LOCK_MINUTES} minutes without use, and whenever RailBook closes.</small>
        </span>
      </div>
      <div className="button-row">
        <button type="button" className="button secondary small" onClick={() => setChanging(true)}>
          <Icon name="key" size={16} />
          Change master password
        </button>
        <button type="button" className="button ghost small" onClick={vault.lock}>
          <Icon name="lock" size={16} />
          Lock now
        </button>
      </div>
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
    </>
  )
}

/** Settings › IRCTC logins: every account you book with, once the master password has unlocked them. */
export function LoginsSection() {
  const vault = useVault()
  const [editing, setEditing] = useState<IrctcLogin | 'new' | null>(null)
  const [deleting, setDeleting] = useState<IrctcLogin | null>(null)

  if (vault.status === 'loading') return null
  if (vault.status !== 'unlocked') {
    return (
      <p className="muted">
        {vault.status === 'none'
          ? "Set a master password first. Then add family members' accounts here."
          : 'Unlock with your master password to see and add logins.'}
      </p>
    )
  }

  return (
    <>
      {vault.logins.length === 0 ? (
        <p className="muted">No logins yet. Save yours in Profile, and add family members' accounts here.</p>
      ) : (
        <ul className="login-list">
          {vault.logins.map((login) => (
            <LoginRow
              key={login.id}
              login={login}
              onEdit={() => setEditing(login)}
              onDelete={() => setDeleting(login)}
              onMakeDefault={() => void vault.save({ ...login, isDefault: true })}
            />
          ))}
        </ul>
      )}
      <div className="button-row">
        <button type="button" className="button secondary small" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} />
          Add login
        </button>
      </div>

      <LoginDialog
        open={editing !== null}
        login={editing === 'new' || editing === null ? undefined : editing}
        first={vault.logins.length === 0}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.label ?? 'this login'}?`}
        body="Its username and password are removed from this computer. Tasks that used it switch to your default login."
        confirmLabel="Delete login"
        onConfirm={async () => {
          if (deleting) await vault.remove(deleting.id)
          setDeleting(null)
        }}
        onClose={() => setDeleting(null)}
      />
    </>
  )
}
