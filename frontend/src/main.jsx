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
import App from './App.jsx'

// Apply the motion preference before the first paint so nothing animates
// that shouldn't
applyMotionAttribute(resolveReducedMotion(readMotionPreference(), systemPrefersReducedMotion()))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
