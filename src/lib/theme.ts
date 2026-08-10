export type Theme = 'dark' | 'light'

const key = 'wenhao-theme'

export function getInitialTheme(): Theme {
  const saved = window.localStorage.getItem(key)
  if (saved === 'dark' || saved === 'light') return saved
  return 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b0d10' : '#f4f5f6')
  window.localStorage.setItem(key, theme)
}
