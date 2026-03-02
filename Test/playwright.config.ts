import { defineConfig } from '@playwright/test'

const useWebServer = process.env.PW_NO_WEBSERVER !== '1'
const uiBaseUrl = process.env.UI_BASE_URL ?? 'http://127.0.0.1:5173'
const runHeadless = process.env.CI === '1' || process.env.CI === 'true'

export default defineConfig({
  testDir: './ui',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: uiBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: runHeadless,
  },
  webServer: useWebServer
    ? [
      {
        command: '.\\.venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000',
        cwd: '../backend',
        url: 'http://127.0.0.1:8000/health',
        timeout: 120_000,
        reuseExistingServer: true,
      },
      {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        cwd: '../app',
        url: `${uiBaseUrl}/login`,
        timeout: 120_000,
        reuseExistingServer: true,
      },
    ]
    : undefined,
})
