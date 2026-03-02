import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportClientError } from '../utils/clientErrorMonitor'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || '页面发生异常',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    reportClientError(error, 'error', { componentStack: errorInfo.componentStack })
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--bg-app, #f8fafc)',
          color: 'var(--text-main, #0f172a)',
        }}
      >
        <div
          style={{
            width: 'min(560px, 100%)',
            border: '1px solid var(--border-color, #e2e8f0)',
            background: 'var(--bg-panel, #fff)',
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 8px 24px rgb(0 0 0 / 0.08)',
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 600 }}>页面发生异常</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
            系统已记录错误信息。你可以尝试重新渲染当前页面或刷新浏览器。
          </div>
          <code
            style={{
              display: 'block',
              padding: 10,
              borderRadius: 8,
              background: 'rgba(148,163,184,0.12)',
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.message}
          </code>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="cm-btn cm-btn--primary" onClick={this.handleReset}>
              重试渲染
            </button>
            <button type="button" className="cm-btn" onClick={this.handleReload}>
              刷新页面
            </button>
          </div>
        </div>
      </div>
    )
  }
}
