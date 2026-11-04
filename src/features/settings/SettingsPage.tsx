import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings } from '../../core/settings'
import { clearAppData } from '../../core/storage'
import type { Profile, Theme } from '../../core/types'
import { ALERT_MINUTE_OPTIONS } from '../../platform/alerts'
import { getAppInfo, openDataFolder, type AppInfo } from '../../platform/appInfo'
import { ToggleChips } from '../../ui/controls'
import { Icon, type IconName } from '../../ui/Icon'
import { Avatar, ConfirmDialog, Notice, PageHeader } from '../../ui/layout'
import { useToast } from '../../ui/toast'
import { LoginsSection } from '../logins/LoginsSection'
import { useVault } from '../logins/VaultProvider'

const THEMES: { theme: Theme; label: string; detail: string; icon: IconName }[] = [
  { theme: 'system', label: 'System', detail: 'Follow the computer', icon: 'monitor' },
  { theme: 'light', label: 'Light', detail: 'Always light', icon: 'sun' },
  { theme: 'dark', label: 'Dark', detail: 'Always dark', icon: 'moon' },
]

const PROFILE_FIELDS: { key: keyof Profile; label: string; type: string; hint?: string }[] = [
  { key: 'name', label: 'Your name', type: 'text' },
  { key: 'mobile', label: 'Mobile', type: 'tel', hint: 'Suggested for new tasks' },
  { key: 'email', label: 'Email', type: 'email' },
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
  const changed = PROFILE_FIELDS.some(({ key }) => profile[key] !== settings.profile[key])

  useEffect(() => {
    void getAppInfo().then(setInfo)
  }, [])

  // Other screens link straight to a section, such as /settings#logins.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    await update({ profile: { ...profile, name: profile.name.trim() } })
    toast('Profile saved')
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
          description="Your name, and the mobile number new tasks suggest for the ticket."
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
            {PROFILE_FIELDS.map(({ key, label, type, hint }) => (
              <label key={key} className="field">
                <span>{label}</span>
                <input
                  type={type}
                  autoComplete="off"
                  value={profile[key]}
                  onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
                />
                {hint && <small className="field-hint">{hint}</small>}
              </label>
            ))}
            <div className="form-actions span-2">
              <button type="submit" className="button" disabled={!changed}>
                {changed ? 'Save profile' : 'Profile saved'}
              </button>
            </div>
          </form>
        </SettingsSection>

        <SettingsSection
          id="logins"
          title="IRCTC logins"
          description="The accounts you book with, for the copy panel. Encrypted with a master password before they're saved. RailBook never signs in for you."
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
