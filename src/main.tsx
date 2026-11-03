import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { AuthProvider } from './auth/AuthProvider'
import { MusicProvider } from './music/MusicProvider'
import { installWebAnalytics } from './lib/webAnalytics'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <MusicProvider>
        <App />
      </MusicProvider>
    </AuthProvider>
  </StrictMode>,
)

installWebAnalytics()
