type ErrorLevel = 'error' | 'unhandledrejection'

type ClientErrorPayload = {
  level: ErrorLevel
  message: string
  stack?: string
  url: string
  userAgent?: string
  timestamp: string
  extra?: Record<string, unknown>
}

let installed = false

const REPORT_URL = import.meta.env.VITE_CLIENT_ERROR_REPORT_URL as string | undefined

const sendPayload = (payload: ClientErrorPayload) => {
  if (!REPORT_URL || typeof window === 'undefined') {
    console.error('[client-error]', payload)
    return
  }

  const body = JSON.stringify(payload)
  const blob = new Blob([body], { type: 'application/json' })

  if (navigator.sendBeacon?.(REPORT_URL, blob)) {
    return
  }

  void fetch(REPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    console.error('[client-error:report-failed]', payload)
  })
}

export const reportClientError = (
  error: unknown,
  level: ErrorLevel = 'error',
  extra?: Record<string, unknown>,
) => {
  const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'))
  const payload: ClientErrorPayload = {
    level,
    message: err.message || 'Unknown error',
    stack: err.stack,
    url: typeof window === 'undefined' ? '' : window.location.href,
    userAgent: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
    timestamp: new Date().toISOString(),
    extra,
  }
  sendPayload(payload)
}

export const installClientErrorMonitor = () => {
  if (installed || typeof window === 'undefined') {
    return
  }
  installed = true

  const previousOnError = window.onerror
  window.onerror = (message, source, lineno, colno, error) => {
    const resolvedError =
      error ?? new Error(`${String(message)} @ ${String(source)}:${String(lineno)}:${String(colno)}`)
    reportClientError(resolvedError, 'error')
    return previousOnError?.call(window, message, source, lineno, colno, error) ?? false
  }

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, 'unhandledrejection')
  })
}
