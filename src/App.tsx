import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom'
import { SettingsProvider, useSettings } from './core/settings'
import { HomePage } from './features/home/HomePage'
import { VaultProvider } from './features/logins/VaultProvider'
import { SiteAutomations } from './features/site/SiteAutomations'
import { SitePage } from './features/site/SitePage'
import { SiteProvider } from './features/site/SiteProvider'
import { PassengersPage } from './features/passengers/PassengersPage'
import { PnrPage } from './features/pnr/PnrPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { PracticePage } from './features/tatkal/PracticePage'
import { SessionPage } from './features/tasks/SessionPage'
import { TaskDetailPage } from './features/tasks/TaskDetailPage'
import { TasksPage } from './features/tasks/TasksPage'
import { TaskWizardPage } from './features/tasks/TaskWizardPage'
import { WelcomePage } from './features/welcome/WelcomePage'
import { CommandPalette } from './ui/CommandPalette'
import { Dialog, Keys } from './ui/layout'
import { SHORTCUTS, useShortcut } from './ui/shortcuts'
import { NAV, Sidebar } from './ui/Sidebar'
import { ToastProvider } from './ui/toast'

export function App() {
  return (
    <SettingsProvider>
      <VaultProvider>
        <SiteProvider>
          <ToastProvider>
            <SiteAutomations />
            <BrowserRouter>
              <Shell />
            </BrowserRouter>
          </ToastProvider>
        </SiteProvider>
      </VaultProvider>
    </SettingsProvider>
  )
}

// Focused flows fill the window without the sidebar, so a stray click or shortcut can't leave them.
const FOCUSED = ['/welcome', '/tasks/new', '/tasks/:id/edit', '/tasks/:id/run', '/practice']

function Shell() {
  const { settings } = useSettings()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const main = useRef<HTMLElement>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const focused = FOCUSED.some((pattern) => matchPath(pattern, pathname))
  const enabled = !focused && settings.onboarded

  useShortcut('k', () => setPaletteOpen((open) => !open), { mod: true, enabled })
  useShortcut(',', () => navigate('/settings'), { mod: true, enabled })
  useShortcut('n', () => navigate('/tasks/new'), { enabled })
  useShortcut('?', () => setShortcutsOpen(true), { enabled })
  const goToSection = (key: string) => () => {
    const section = NAV.find((item) => item.key === key)
    if (section) navigate(section.to)
  }
  useShortcut('1', goToSection('1'), { enabled })
  useShortcut('2', goToSection('2'), { enabled })
  useShortcut('3', goToSection('3'), { enabled })
  useShortcut('4', goToSection('4'), { enabled })
  useShortcut('5', goToSection('5'), { enabled })

  // The content scrolls on its own, so start each screen at the top.
  useEffect(() => {
    main.current?.scrollTo(0, 0)
  }, [pathname])

  if (!settings.onboarded && pathname !== '/welcome') return <Navigate to="/welcome" replace />

  const routes = (
    <Routes>
      <Route path="/" element={<HomePage onSearch={() => setPaletteOpen(true)} />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/tasks/new" element={<TaskWizardPage />} />
      <Route path="/tasks/:id" element={<TaskDetailPage />} />
      <Route path="/tasks/:id/edit" element={<TaskWizardPage />} />
      <Route path="/tasks/:id/run" element={<SessionPage />} />
      <Route path="/passengers" element={<PassengersPage />} />
      <Route path="/pnr" element={<PnrPage />} />
      <Route path="/settings" element={<SettingsPage onShowShortcuts={() => setShortcutsOpen(true)} />} />
      <Route path="/practice" element={<PracticePage />} />
      {import.meta.env.DEV && <Route path="/dev/site" element={<SitePage />} />}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )

  if (focused) return routes

  return (
    <div className="shell">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <main ref={main} className="shell-main">
        <div className="page">{routes}</div>
      </main>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <Dialog open={shortcutsOpen} title="Keyboard shortcuts" onClose={() => setShortcutsOpen(false)}>
        <dl className="shortcut-list">
          {SHORTCUTS.map(({ keys, label }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <Keys keys={keys} />
              </dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  )
}
