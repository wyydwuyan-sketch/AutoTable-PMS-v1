import baseConfig from './playwright.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...baseConfig,
  use: {
    ...baseConfig.use,
    screenshot: 'on',
    video: 'off',
    trace: 'off',
  },
})
