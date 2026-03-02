import { expect, test } from './fixtures'

import { loginAsAdmin, openSidebarConfig } from './helpers'

test.describe('组件参考模块', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('组件参考页为纯浏览模式（无应用按钮）', async ({ page }) => {
    await openSidebarConfig(page, '组件参考', /\/config\/showcase$/)

    await expect(page.getByText('字段组件参考 / Field Component Reference')).toBeVisible()
    await expect(page.getByText('页面模式：浏览模式')).toBeVisible()
    await expect(page.getByText('应用到目标视图')).toHaveCount(0)
    await expect(page.getByText('配置并应用')).toHaveCount(0)
  })

  test('组件参考页可从其他配置页再次进入', async ({ page }) => {
    await openSidebarConfig(page, '视图组件配置', /\/config\/components/)
    await openSidebarConfig(page, '组件参考', /\/config\/showcase$/)

    await expect(page.getByText('字段组件参考 / Field Component Reference')).toBeVisible()
  })
})
