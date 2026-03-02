import { expect, test } from './fixtures'

import { expectMainGridReady, gotoLogin, loginAsAdmin } from './helpers'

test.describe('认证模块', () => {
  test('登录页显示账号密码输入与提交按钮', async ({ page }) => {
    await gotoLogin(page)

    const loginButton = page.getByRole('button', { name: '登录', exact: true })
    await expect(loginButton).toBeVisible()

    const inputs = page.locator('input.cm-input')
    await expect.poll(async () => inputs.count()).toBeGreaterThanOrEqual(2)
    await expect(inputs.nth(1)).toHaveAttribute('type', 'password')
  })

  test('管理员登录后进入主表格页', async ({ page }) => {
    await loginAsAdmin(page)

    await expectMainGridReady(page)
    await expect(page.getByRole('button', { name: '筛选' })).toBeVisible()
  })
})
