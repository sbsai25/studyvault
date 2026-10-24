import { useEffect, useMemo, useState } from 'react';
import {
  ThemePreferenceContext,
  applyThemeAttribute,
  readThemePreference,
  resolveTheme,
  storeThemePreference,
  systemPrefersDark,
  watchSystemDark,
} from './themePreference';

// Applies the viewer's theme preference to the page and keeps it in step
// with the OS setting while the preference is 'system'.
function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => watchSystemDark(setSystemDark), []);

  const theme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      preference,
      theme,
      systemDark,
      setPreference: (next) => {
        storeThemePreference(next);
        setPreferenceState(next);
      },
    }),
    [preference, theme, systemDark]
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

export default ThemeProvider;
