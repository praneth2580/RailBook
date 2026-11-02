import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { armSavedAlerts } from './platform/alerts'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void armSavedAlerts()
