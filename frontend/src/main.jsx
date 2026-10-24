import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/plus-jakarta-sans'
import './styles/tokens.css'
import './styles/base.css'
import {
  applyMotionAttribute,
  readMotionPreference,
  resolveReducedMotion,
  systemPrefersReducedMotion,
} from './motion/motionPreference'
import { applyThemeAttribute, readThemePreference, resolveTheme, systemPrefersDark } from './theme/themePreference'
import App from './App.jsx'

// Apply the motion and theme preferences before the first paint so nothing
// animates that shouldn't and the page doesn't flash the wrong theme
applyMotionAttribute(resolveReducedMotion(readMotionPreference(), systemPrefersReducedMotion()))
applyThemeAttribute(resolveTheme(readThemePreference(), systemPrefersDark()))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
