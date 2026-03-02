import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd'
import type { ThemeConfig } from 'antd'
import { THEME_STORAGE_KEY, resolveInitialTheme, type ThemeMode } from '../utils/theme'

const ensureDocumentThemeAttr = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return
  const current = document.documentElement.getAttribute('data-theme')
  if (current !== 'dark' && current !== 'light') {
    document.documentElement.setAttribute('data-theme', mode)
  }
}

const cssVar = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const pxToNumber = (value: string, fallback: number) => {
  const numeric = Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function AntdThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => resolveInitialTheme())

  useEffect(() => {
    ensureDocumentThemeAttr(mode)

    if (typeof window === 'undefined') return
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      const nextMode = resolveInitialTheme()
      setMode(nextMode)
    })

    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaChange = () => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
        const nextMode = media.matches ? 'dark' : 'light'
        setMode(nextMode)
      }
    }

    media.addEventListener?.('change', handleMediaChange)
    return () => {
      observer.disconnect()
      media.removeEventListener?.('change', handleMediaChange)
    }
  }, [mode])

  const antdThemeConfig = useMemo<ThemeConfig>(() => {
    const colorPrimary = cssVar('--primary', mode === 'dark' ? '#60a5fa' : '#3b82f6')
    const colorPrimaryHover = cssVar('--primary-hover', mode === 'dark' ? '#3b82f6' : '#2563eb')
    const colorBgLayout = cssVar('--bg-app', mode === 'dark' ? '#0b1220' : '#f8fafc')
    const colorBgContainer = cssVar('--bg-panel', mode === 'dark' ? '#111827' : '#ffffff')
    const colorBgElevated = cssVar('--bg-header', colorBgContainer)
    const colorFillSecondary = cssVar('--bg-hover', mode === 'dark' ? 'rgba(148,163,184,0.12)' : '#f1f5f9')
    const colorFillTertiary = cssVar('--bg-active', mode === 'dark' ? 'rgba(148,163,184,0.2)' : '#e2e8f0')
    const colorBorder = cssVar('--border-color', mode === 'dark' ? '#334155' : '#e2e8f0')
    const colorBorderSecondary = cssVar('--border-strong', mode === 'dark' ? '#475569' : '#cbd5e1')
    const colorText = cssVar('--text-main', mode === 'dark' ? '#e2e8f0' : '#0f172a')
    const colorTextSecondary = cssVar('--text-secondary', mode === 'dark' ? '#94a3b8' : '#64748b')
    const colorTextTertiary = cssVar('--text-muted', mode === 'dark' ? '#64748b' : '#94a3b8')
    const colorError = cssVar('--danger-accent', mode === 'dark' ? '#fca5a5' : '#b91c1c')
    const borderRadius = pxToNumber(cssVar('--radius', '8px'), 8)
    const fontFamily = cssVar('--font-sans', 'Inter, system-ui, sans-serif')
    const boxShadow = cssVar('--shadow', mode === 'dark'
      ? '0 8px 16px 0 rgb(0 0 0 / 0.35), 0 2px 8px -1px rgb(0 0 0 / 0.28)'
      : '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)')

    return {
      algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary,
        colorLink: colorPrimary,
        colorLinkHover: colorPrimaryHover,
        colorText,
        colorTextSecondary,
        colorTextTertiary,
        colorBgLayout,
        colorBgBase: colorBgLayout,
        colorBgContainer,
        colorBgElevated,
        colorFillSecondary,
        colorFillTertiary,
        colorBorder,
        colorBorderSecondary,
        colorError,
        borderRadius,
        fontFamily,
        boxShadow,
      },
    }
  }, [mode])

  return (
    <ConfigProvider theme={antdThemeConfig}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  )
}
