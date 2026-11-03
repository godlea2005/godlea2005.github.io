import { useEffect, useLayoutEffect, useState } from 'react'
import { applyTheme, getInitialPreference, resolveTheme, type ThemePreference } from './theme'

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(getInitialPreference)
  const [systemTheme, setSystemTheme] = useState(() => resolveTheme('system'))
  useEffect(() => {
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const sync = () => setSystemTheme(media?.matches ? 'dark' : 'light')
    media?.addEventListener('change', sync)
    sync()
    return () => media?.removeEventListener('change', sync)
  }, [])
  const theme = preference === 'system' ? systemTheme : preference
  useLayoutEffect(() => { applyTheme(theme, false) }, [theme])
  useEffect(() => { window.localStorage.setItem('wenhao-theme', preference) }, [preference])
  return { theme, preference, setPreference }
}
