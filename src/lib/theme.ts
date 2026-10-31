export type Theme = 'dark' | 'light'
export type ThemePreference = Theme | 'system'

const key = 'wenhao-theme'

export function getInitialPreference(): ThemePreference {
  const saved = window.localStorage.getItem(key)
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark'
}

export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== 'system') return preference
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getInitialTheme(): Theme {
  return resolveTheme(getInitialPreference())
}

export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d10' : '#f4f5f6')
  if (persist) window.localStorage.setItem(key, theme)
}
