export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'app_theme_mode'

const isThemeMode = (value: unknown): value is ThemeMode => value === 'light' || value === 'dark'

export const resolveInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }

  if (typeof document !== 'undefined') {
    const attrTheme = document.documentElement.getAttribute('data-theme')
    if (isThemeMode(attrTheme)) {
      return attrTheme
    }
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(storedTheme)) {
      return storedTheme
    }
  } catch {
    // Ignore localStorage access errors and fall back to system theme.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
