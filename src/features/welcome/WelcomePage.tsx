import { useNavigate } from 'react-router-dom'
import { useSettings } from '../../core/settings'
import { Icon, type IconName } from '../../ui/Icon'
import { useDocumentTitle } from '../../ui/layout'

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'clock',
    title: 'Never miss the window',
    body: 'Countdowns and desktop alerts for Tatkal, Premium Tatkal and General booking.',
  },
  {
    icon: 'bolt',
    title: 'Fill forms in seconds',
    body: 'Stations, trains and passenger details are one click from your clipboard.',
  },
  {
    icon: 'tasks',
    title: 'Run a guided session',
    body: 'A timed, step-by-step pipeline takes you from sign-in to PNR.',
  },
  {
    icon: 'shield',
    title: 'You stay in control',
    body: 'Sign-in, CAPTCHA, OTP and payment happen on the official IRCTC site, by you.',
  },
]

export function WelcomePage() {
  const { update } = useSettings()
  const navigate = useNavigate()
  useDocumentTitle('Welcome')

  const start = async () => {
    await update({ onboarded: true })
    navigate('/', { replace: true })
  }

  return (
    <div className="welcome">
      <section className="welcome-brand">
        <span className="logo">
          <Icon name="train" size={40} />
        </span>
        <h1>RailBook</h1>
        <p>Your Tatkal booking co-pilot</p>
        <small>Everything you save stays on this computer.</small>
      </section>

      <section className="welcome-content">
        <div>
          <h2>Have every detail ready before the window opens</h2>
          <p className="muted">RailBook prepares you to book faster by hand. Here's what it does.</p>
        </div>
        <ul className="feature-grid">
          {FEATURES.map(({ icon, title, body }) => (
            <li key={title}>
              <span className="option-icon">
                <Icon name={icon} size={18} />
              </span>
              <strong>{title}</strong>
              <small className="muted">{body}</small>
            </li>
          ))}
        </ul>
        <div className="welcome-actions">
          <button type="button" className="button large" autoFocus onClick={start}>
            Get started
            <Icon name="arrow" size={18} />
          </button>
          <small className="muted">or press Enter</small>
        </div>
      </section>
    </div>
  )
}
