import { useNavigate } from 'react-router-dom'
import { useSettings } from '../../core/settings'
import { Icon, type IconName } from '../../ui/Icon'

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'clock',
    title: 'Never miss the window',
    body: 'Countdowns and alerts for Tatkal, Premium Tatkal and General booking.',
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

  const start = async () => {
    await update({ onboarded: true })
    navigate('/', { replace: true })
  }

  return (
    <div className="welcome">
      <div className="welcome-hero">
        <span className="logo">
          <Icon name="train" size={40} />
        </span>
        <h1>RailBook</h1>
        <p>Your Tatkal booking co-pilot</p>
      </div>
      <ul className="feature-list">
        {FEATURES.map(({ icon, title, body }) => (
          <li key={title}>
            <span className="option-icon">
              <Icon name={icon} />
            </span>
            <span className="list-text">
              <strong>{title}</strong>
              <small>{body}</small>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="button large" onClick={start}>
        Get started
        <Icon name="arrow" />
      </button>
    </div>
  )
}
