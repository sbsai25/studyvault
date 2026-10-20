import { createContext, useContext } from 'react';

// The viewer's motion preference: follow the OS setting, always reduce, or
// always allow motion. Stored per browser; it never needs to reach the server.
export const MOTION_PREFERENCES = ['system', 'reduced', 'full'];

const STORAGE_KEY = 'studyvault:motion';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

export function readMotionPreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return MOTION_PREFERENCES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function storeMotionPreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit
  }
}

export function systemPrefersReducedMotion() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(REDUCED_QUERY).matches);
}

export function watchSystemReducedMotion(callback) {
  const query = window.matchMedia?.(REDUCED_QUERY);
  if (!query) return () => {};
  const onChange = (event) => callback(event.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function resolveReducedMotion(preference, systemReduced) {
  return preference === 'reduced' || (preference === 'system' && systemReduced);
}

// CSS reads html[data-motion] (see styles/base.css)
export function applyMotionAttribute(reduced) {
  document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
}

export const MotionPreferenceContext = createContext({
  preference: 'system',
  reduced: false,
  setPreference: () => {},
});

export const useMotionPreference = () => useContext(MotionPreferenceContext);
