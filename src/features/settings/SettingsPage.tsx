import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../../core/settings'
import { clearAppData } from '../../core/storage'
import type { IrctcLogin, Theme } from '../../core/types'
import { ALERT_MINUTE_OPTIONS } from '../../platform/alerts'
import { getAppInfo, openDataFolder, type AppInfo } from '../../platform/appInfo'
import { getScrapingBrowser, setScrapingBrowser } from '../../platform/devTools'
import { Switch, ToggleChips } from '../../ui/controls'
import { Icon, type IconName } from '../../ui/Icon'
import { Avatar, ConfirmDialog, Notice, PageHeader } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { LoginsSection, MasterPasswordSection } from '../logins/LoginsSection'
import { SecretInput } from '../logins/SecretInput'
import { pickLogin, useVault } from '../logins/VaultProvider'

const THEMES: { theme: Theme; label: string; detail: string; icon: IconName }[] = [
  { theme: 'system', label: 'System', detail: 'Follow the computer', icon: 'monitor' },
  { theme: 'light', label: 'Light', detail: 'Always light', icon: 'sun' },
  { theme: 'dark', label: 'Dark', detail: 'Always dark', icon: 'moon' },
]

function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="settings-section">
      <div className="settings-intro">
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      <div className="settings-body">{children}</div>
    </section>
  )
}

/** Under npm run dev only; production builds leave it out. */
function DeveloperSection() {
  const toast = useToast()
  const [headless, setHeadless] = useState<boolean | null>(null)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)

  // The launcher only answers when npm run dev started it, so hide the section when it doesn't.
  useEffect(() => {
    getScrapingBrowser().then(
      ({ headless: current }) => setHeadless(current),
      () => setAvailable(false),
    )
  }, [])

  const change = async (show: boolean) => {
    setBusy(true)
    try {
      setHeadless((await setScrapingBrowser(!show)).headless)
      toast(show ? 'The scraping browser opens in a window from the next page' : 'The scraping browser is hidden again')
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (!available) return null
  return (
    <SettingsSection
      id="developer"
      title="Developer"
      description="Only while running npm run dev. Remembered between dev runs."
    >
      {headless === null ? null : (
        <div className="switch-list">
          <Switch
            label="Show the scraping browser"
            description={
              busy
                ? 'Switching…'
                : "Runs WRAITH's Chrome in a visible window, to watch pages load and actions run, and reopens the companion website the same way when one is set. Start this way with npm run dev -- --headed."
            }
            checked={!headless}
            onChange={(show) => void change(show)}
          />
        </div>
      )}
    </SettingsSection>
  )
}

function SettingRow({ title, description, action }: { title: string; description: ReactNode; action: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="list-text">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      {action}
    </div>
  )
}

export function SettingsPage({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const { settings, update } = useSettings()
  const vault = useVault()
  const toast = useToast()
  const { hash } = useLocation()
  const [profile, setProfile] = useState(settings.profile)
  const [clearing, setClearing] = useState(false)
  const [info, setInfo] = useState<AppInfo | null>(null)
  // The IRCTC username and password are the default login's, saved in the vault the master password encrypts.
  const unlocked = vault.status === 'unlocked'
  const defaultLogin = unlocked ? pickLogin(vault.logins) : undefined
  const savedUsername = vault.status === 'none' ? settings.profile.irctcUsername : (defaultLogin?.username ?? '')
  const savedPassword = defaultLogin?.password ?? ''
  const [login, setLogin] = useState({ username: savedUsername, password: savedPassword })
  const [loginError, setLoginError] = useState('')
  const loginChanged = unlocked && (login.username !== savedUsername || login.password !== savedPassword)
  const changed = profile.name !== settings.profile.name || loginChanged

  // Show the default login once it can be read, and again when it changes in IRCTC logins below.
  useEffect(() => setLogin({ username: savedUsername, password: savedPassword }), [savedUsername, savedPassword])

  useEffect(() => {
    void getAppInfo().then(setInfo)
  }, [])

  // Other screens link straight to a section, such as /settings#logins.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  const loginToSave = (): IrctcLogin => {
    const username = login.username.trim()
    if (!username) throw new Error('Add your IRCTC username to go with the password.')
    const base: IrctcLogin = defaultLogin ?? {
      id: crypto.randomUUID(),
      label: 'Mine',
      username: '',
      password: '',
      mobile: profile.mobile,
      email: profile.email,
      note: '',
      isDefault: true,
    }
    return { ...base, username, password: login.password, isDefault: true }
  }

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    setLoginError('')
    try {
      if (loginChanged) await vault.save(loginToSave())
      // The vault now holds the username, so the old plain-text copy can go.
      await update({
        profile: { ...profile, name: profile.name.trim(), irctcUsername: unlocked ? '' : profile.irctcUsername },
      })
      toast('Profile saved')
    } catch (failure) {
      setLoginError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const clearAll = async () => {
    await clearAppData()
    // Reload so every screen starts again from empty storage.
    window.location.replace('/')
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile, alerts, appearance and data" />

      <div className="settings-sections">
        <SettingsSection
          id="profile"
          title="Profile"
          description="Your name and your IRCTC username and password. The master password below encrypts the IRCTC details before they're saved."
        >
          <div className="profile-head">
            <Avatar id="profile" name={profile.name || 'You'} size={44} />
            <span className="list-text">
              <strong>{settings.profile.name || 'Your profile'}</strong>
              <small>
                {vault.count === 0
                  ? 'No IRCTC logins saved yet'
                  : `${vault.count} IRCTC ${vault.count === 1 ? 'login' : 'logins'} saved`}
              </small>
            </span>
          </div>
          <form className="form-grid two" onSubmit={saveProfile}>
            <label className="field span-2">
              <span>Profile name</span>
              <input
                autoComplete="off"
                value={profile.name}
                onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>IRCTC username</span>
              <input
                autoComplete="off"
                spellCheck={false}
                disabled={!unlocked}
                value={login.username}
                onChange={(event) => setLogin({ ...login, username: event.target.value })}
              />
            </label>
            <SecretInput
              label="IRCTC password"
              value={login.password}
              disabled={!unlocked}
              onChange={(password) => setLogin({ ...login, password })}
              autoComplete="new-password"
            />
            <small className="muted span-2">
              {vault.status === 'none'
                ? 'Set a master password below first. It encrypts your IRCTC username and password before they are saved.'
                : vault.status === 'locked'
                  ? 'Locked. Unlock with your master password below to see or change them.'
                  : defaultLogin
                    ? `Your default IRCTC login, “${defaultLogin.label}”. Encrypted with your master password.`
                    : 'Encrypted with your master password when you save.'}
            </small>
            {loginError && <small className="error span-2">{loginError}</small>}
            <div className="form-actions span-2">
              <button type="submit" className="button" disabled={!changed}>
                {changed ? 'Save profile' : 'Profile saved'}
              </button>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection
          id="master-password"
          title="Master password"
          description="Encrypts your IRCTC usernames and passwords before they're saved. RailBook never saves it, so if you forget it the logins can only be deleted."
        >
          <MasterPasswordSection />
        </SettingsSection>

        <SettingsSection
          id="logins"
          title="IRCTC logins"
          description="Every account you book with, such as family members'. Your profile login is the default. RailBook only copies them for you to paste; it never signs in."
        >
          <LoginsSection />
        </SettingsSection>

        <SettingsSection
          id="alerts"
          title="Window alerts"
          description="Desktop notifications before a booking window opens. They appear while RailBook is open."
        >
          <div className="field">
            <span>Remind me this long before</span>
            <ToggleChips
              label="Alert lead times"
              options={ALERT_MINUTE_OPTIONS}
              values={settings.alertMinutes}
              onChange={(minutes) => update({ alertMinutes: minutes.sort((a, b) => b - a) })}
              format={(minutes) => `${minutes} min`}
            />
          </div>
          <small className="muted">Applies the next time you set alerts on a task.</small>
        </SettingsSection>

        <SettingsSection id="appearance" title="Appearance" description="Choose how RailBook looks.">
          <div className="theme-options" role="radiogroup" aria-label="Theme">
            {THEMES.map(({ theme, label, detail, icon }) => (
              <label key={theme} className={`option-card${settings.theme === theme ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  checked={settings.theme === theme}
                  onChange={() => update({ theme })}
                />
                <span className={`theme-swatch ${theme}`}>
                  <Icon name={icon} size={18} />
                </span>
                <span className="list-text">
                  <strong>{label}</strong>
                  <small>{detail}</small>
                </span>
              </label>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection
          id="data"
          title="Your data"
          description="Everything stays on this computer. IRCTC logins are encrypted; tasks, passengers, PNRs and settings are in a file that isn't."
        >
          <SettingRow
            title="Data folder"
            description={<span className="mono">{info?.dataDirectory ?? '…'}</span>}
            action={
              <button type="button" className="button secondary small" onClick={() => void openDataFolder()}>
                <Icon name="folder" size={16} />
                Show folder
              </button>
            }
          />
          <SettingRow
            title="Keyboard shortcuts"
            description="Every shortcut RailBook understands"
            action={
              <button type="button" className="button secondary small" onClick={onShowShortcuts}>
                <Icon name="keyboard" size={16} />
                Show
              </button>
            }
          />
          <SettingRow
            title="Welcome tour"
            description="See what RailBook does again"
            action={
              <button type="button" className="button secondary small" onClick={() => update({ onboarded: false })}>
                <Icon name="sparkle" size={16} />
                Show
              </button>
            }
          />
          <SettingRow
            title="Clear all data"
            description="Deletes every task, passenger, PNR and setting"
            action={
              <button type="button" className="button danger small" onClick={() => setClearing(true)}>
                <Icon name="trash" size={16} />
                Clear…
              </button>
            }
          />
        </SettingsSection>

        {import.meta.env.DEV && <DeveloperSection />}

        <SettingsSection id="about" title="About RailBook" description={info ? `Version ${info.version}` : ''}>
          <Notice icon="shield">
            RailBook helps you prepare and book faster by hand. It doesn't automate or scrape IRCTC: sign-in, CAPTCHA,
            OTP, payment and submission all happen on the official site.
          </Notice>
          {info && <small className="muted mono">Running in {info.browser}</small>}
        </SettingsSection>
      </div>

      <ConfirmDialog
        open={clearing}
        title="Clear all data?"
        body="This deletes every booking task, passenger, PNR and setting on this computer. It can't be undone."
        confirmLabel="Clear everything"
        onConfirm={clearAll}
        onClose={() => setClearing(false)}
      />
    </>
  )
}
