import { expect, test } from './fixtures'
import { loginAsAdmin } from './helpers'

test.describe('大屏模块', () => {
  test('可从头部按钮进入大屏页面并返回表格', async ({ page }) => {
    await loginAsAdmin(page)

    await page.getByRole('button', { name: '大屏' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByText('首页大屏')).toBeVisible()

    await page.getByRole('button', { name: /返回表格/ }).click()
    await expect(page).toHaveURL(/\/b\/base_1\/t\/.+\/v\/.+/)
  })
})
