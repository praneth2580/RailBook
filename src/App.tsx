import { BrowserRouter, NavLink, Navigate, Route, Routes, matchPath, useLocation } from 'react-router-dom'
import { SettingsProvider, useSettings } from './core/settings'
import { HomePage } from './features/home/HomePage'
import { PassengersPage } from './features/passengers/PassengersPage'
import { PnrPage } from './features/pnr/PnrPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { PracticePage } from './features/tatkal/PracticePage'
import { SessionPage } from './features/tasks/SessionPage'
import { TaskDetailPage } from './features/tasks/TaskDetailPage'
import { TasksPage } from './features/tasks/TasksPage'
import { TaskWizardPage } from './features/tasks/TaskWizardPage'
import { WelcomePage } from './features/welcome/WelcomePage'
import { Icon, type IconName } from './ui/Icon'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/tasks', label: 'Tasks', icon: 'tasks' },
  { to: '/passengers', label: 'Passengers', icon: 'users' },
  { to: '/pnr', label: 'PNR', icon: 'ticket' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

// Focused flows hide the tab bar so a stray click can't leave them.
const FULL_SCREEN = ['/welcome', '/tasks/new', '/tasks/:id/edit', '/tasks/:id/run', '/practice']

export function App() {
  return (
    <SettingsProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </SettingsProvider>
  )
}

function Shell() {
  const { settings } = useSettings()
  const { pathname } = useLocation()
  const fullScreen = FULL_SCREEN.some((pattern) => matchPath(pattern, pathname))

  if (!settings.onboarded && pathname !== '/welcome') return <Navigate to="/welcome" replace />

  return (
    <>
      <main className={fullScreen ? 'page full' : 'page'}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/new" element={<TaskWizardPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/tasks/:id/edit" element={<TaskWizardPage />} />
          <Route path="/tasks/:id/run" element={<SessionPage />} />
          <Route path="/passengers" element={<PassengersPage />} />
          <Route path="/pnr" element={<PnrPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!fullScreen && (
        <nav className="tabs" aria-label="Main">
          {TABS.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon name={icon} size={22} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  )
}
