import { expect, test } from './fixtures'

import {
  confirmByPrimaryButton,
  createUniqueName,
  expectToastContains,
  loginAsAdmin,
  openSidebarConfig,
} from './helpers'

test.describe('视图配置模块', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('可从侧边栏进入视图配置页并看到新增入口', async ({ page }) => {
    await openSidebarConfig(page, '视图配置', /\/config\/views$/)
    await expect(page.getByRole('button', { name: /新增当前表视图/ })).toBeVisible()
  })

  test('新增视图后自动进入初始化向导并可完成初始化', async ({ page }) => {
    await openSidebarConfig(page, '视图配置', /\/config\/views$/)

    await page.getByRole('button', { name: /新增当前表视图/ }).click()
    const createViewModal = page.getByRole('dialog', { name: '新增视图' })
    await expect(createViewModal).toBeVisible()

    const viewName = createUniqueName('E2E视图')
    await createViewModal.locator('input[placeholder="输入视图名称"]').fill(viewName)
    await createViewModal.getByRole('button', { name: /保\s*存/ }).click()
    await confirmByPrimaryButton(page)

    await expect(page).toHaveURL(/\/config\/components\?setup=1$/)
    const setupWizard = page.getByRole('dialog', { name: /初始化视图/ })
    await expect(setupWizard).toBeVisible()
    await expect(setupWizard.getByText('Step 1：选择可见字段')).toBeVisible()
    await expect(setupWizard.getByText('Step 2：快速配置组件类型')).toBeVisible()

    await setupWizard.getByRole('button', { name: '完成初始化' }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('setup')).toBe(null)
    await expectToastContains(page, '视图初始化已完成。')
  })
})
