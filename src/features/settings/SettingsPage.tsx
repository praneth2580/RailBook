import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { formatDuration } from '../../core/format'
import { useSettings } from '../../core/settings'
import { clearAppData } from '../../core/storage'
import type { Profile, Theme } from '../../core/types'
import { ALERT_MINUTE_OPTIONS } from '../../platform/alerts'
import { Segmented, ToggleChips } from '../../ui/controls'
import { Icon } from '../../ui/Icon'
import { Avatar, ConfirmSheet, Notice, PageHeader, SectionHead } from '../../ui/layout'

const THEMES: Theme[] = ['system', 'light', 'dark']
const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

const PROFILE_FIELDS: { key: keyof Profile; label: string; type: string; inputMode?: 'tel' | 'email' }[] = [
  { key: 'name', label: 'Your name', type: 'text' },
  { key: 'irctcUsername', label: 'IRCTC username', type: 'text' },
  { key: 'mobile', label: 'Mobile', type: 'tel', inputMode: 'tel' },
  { key: 'email', label: 'Email', type: 'email', inputMode: 'email' },
]

export function SettingsPage() {
  const { settings, update } = useSettings()
  const [profile, setProfile] = useState(settings.profile)
  const [clearing, setClearing] = useState(false)
  const changed = PROFILE_FIELDS.some(({ key }) => profile[key] !== settings.profile[key])

  const saveProfile = (event: FormEvent) => {
    event.preventDefault()
    void update({ profile: { ...profile, name: profile.name.trim(), irctcUsername: profile.irctcUsername.trim() } })
  }

  const clearAll = async () => {
    await clearAppData()
    // Reload so every screen starts again from empty storage.
    window.location.replace('/')
  }

  return (
    <>
      <PageHeader title="Settings" />

      <section className="card">
        <div className="card-row">
          <Avatar id="profile" name={settings.profile.name || 'You'} />
          <span className="list-text">
            <strong>{settings.profile.name || 'Your profile'}</strong>
            <small>
              {settings.profile.irctcUsername
                ? `IRCTC · ${settings.profile.irctcUsername}`
                : 'Shown in the copy panel during a session'}
            </small>
          </span>
        </div>
        <form className="stack" onSubmit={saveProfile}>
          {PROFILE_FIELDS.map(({ key, label, type, inputMode }) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                type={type}
                inputMode={inputMode}
                autoComplete="off"
                value={profile[key]}
                onChange={(event) => setProfile({ ...profile, [key]: event.target.value })}
              />
            </label>
          ))}
          <button type="submit" className="button" disabled={!changed}>
            {changed ? 'Save profile' : 'Profile saved'}
          </button>
        </form>
        <Notice icon="lock">
          RailBook never asks for your IRCTC password. These details stay on this computer in RailBook's data folder,
          which isn't encrypted.
        </Notice>
      </section>

      <section className="card stack">
        <SectionHead title="Window alerts" />
        <small className="muted">Remind me this long before a booking window opens</small>
        <ToggleChips
          label="Alert lead times"
          options={ALERT_MINUTE_OPTIONS}
          values={settings.alertMinutes}
          onChange={(minutes) => update({ alertMinutes: minutes.sort((a, b) => b - a) })}
          format={(minutes) => `${minutes} min`}
        />
        <small className="muted">Applies the next time you set alerts on a task.</small>
      </section>

      <section className="card stack">
        <SectionHead title="Appearance" />
        <Segmented
          label="Theme"
          options={THEMES}
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          format={(theme) => THEME_LABELS[theme]}
        />
      </section>

      <nav className="card menu" aria-label="More">
        <Link to="/practice" className="menu-row">
          <Icon name="timer" />
          <span className="list-text">
            <strong>Practice run</strong>
            <small>
              {settings.practiceBestSeconds === null
                ? 'Rehearse the booking steps against the clock'
                : `Best time ${formatDuration(settings.practiceBestSeconds)}`}
            </small>
          </span>
          <Icon name="chevron" />
        </Link>
        <button type="button" className="menu-row" onClick={() => update({ onboarded: false })}>
          <Icon name="sparkle" />
          <span className="list-text">
            <strong>Show the welcome tour</strong>
            <small>See what RailBook does again</small>
          </span>
          <Icon name="chevron" />
        </button>
        <button type="button" className="menu-row danger-text" onClick={() => setClearing(true)}>
          <Icon name="trash" />
          <span className="list-text">
            <strong>Clear all data</strong>
            <small>Tasks, passengers, PNRs and settings</small>
          </span>
        </button>
      </nav>

      <section className="about">
        <h2>About RailBook</h2>
        <p className="muted">
          RailBook helps you prepare and book faster by hand. It doesn't automate or scrape IRCTC: sign-in, CAPTCHA,
          OTP, payment and submission all happen on the official site.
        </p>
      </section>

      <ConfirmSheet
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
