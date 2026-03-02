import { expect, test } from './fixtures'
import { loginAsAdmin, openSidebarConfig, expectToastContains } from './helpers'

test.describe('工作流模块', () => {
  test('可进入工作流配置页并展示状态配置项', async ({ page }) => {
    await loginAsAdmin(page)
    await openSidebarConfig(page, '工作流配置', /\/config\/workflow/)

    await expect(page.getByRole('heading', { name: '工作流配置' })).toBeVisible()
    await expect(page.getByText('状态字段')).toBeVisible()
    await expect(page.getByText('终态定义')).toBeVisible()
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible()
  })

  test('可保存工作流配置', async ({ page }) => {
    await loginAsAdmin(page)
    await openSidebarConfig(page, '工作流配置', /\/config\/workflow/)

    await page.getByRole('button', { name: '保存' }).click()
    await expectToastContains(page, '工作流配置已保存')
  })
})
