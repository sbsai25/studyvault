import { createContext, useContext } from 'react';

// The viewer's colour theme: follow the OS setting, or always light or dark.
// Stored per browser; it never needs to reach the server. index.html repeats
// the read-and-apply step inline so the first paint is already in the right
// theme; keep the storage key and attribute in step with it.
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

const STORAGE_KEY = 'studyvault:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

// The browser UI colour for each theme (--color-bg in styles/tokens.css)
const THEME_COLORS = { light: '#f7f7fb', dark: '#13121c' };

export function readThemePreference() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEME_PREFERENCES.includes(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function storeThemePreference(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable (private mode); the choice then lasts for this visit
  }
}

export function systemPrefersDark() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(DARK_QUERY).matches);
}

export function watchSystemDark(callback) {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) return () => {};
  const onChange = (event) => callback(event.matches);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function resolveTheme(preference, systemDark) {
  if (preference === 'system') return systemDark ? 'dark' : 'light';
  return preference;
}

// CSS reads html[data-theme] (see styles/tokens.css)
export function applyThemeAttribute(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

export const ThemePreferenceContext = createContext({
  preference: 'system',
  theme: 'light',
  systemDark: false,
  setPreference: () => {},
});

export const useThemePreference = () => useContext(ThemePreferenceContext);
