import { expect, test as base } from '@playwright/test'

export const test = base

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return
  }

  const screenshotPath = testInfo.outputPath('failed-end.png')
  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    })
    await testInfo.attach('failed-end-screenshot', {
      path: screenshotPath,
      contentType: 'image/png',
    })
  } catch {
    // If page is already closed/crashed, keep original failure result.
  }
})

export { expect }
