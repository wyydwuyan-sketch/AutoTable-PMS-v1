import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'antd/dist/reset.css'
import './index.css'
import App from './App'
import { AntdThemeProvider } from './app/AntdThemeProvider'
import { ErrorBoundary } from './app/ErrorBoundary'
import { installClientErrorMonitor } from './utils/clientErrorMonitor'

installClientErrorMonitor()

const app = (
  <ErrorBoundary>
    <AntdThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AntdThemeProvider>
  </ErrorBoundary>
)

createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV ? app : <StrictMode>{app}</StrictMode>,
)
