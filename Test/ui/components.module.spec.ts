import { expect, test } from './fixtures'

import { loginAsAdmin, openSidebarConfig } from './helpers'

test.describe('视图组件配置模块', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('可进入视图组件配置页并显示字段编辑入口', async ({ page }) => {
    await openSidebarConfig(page, '视图组件配置', /\/config\/components/)

    const editButtons = page.locator('button[title="编辑组件"]')
    await expect.poll(async () => editButtons.count()).toBeGreaterThan(0)
  })

  test('字段编辑弹窗支持配置和组件预览双Tab', async ({ page }) => {
    await openSidebarConfig(page, '视图组件配置', /\/config\/components/)

    const editButton = page.locator('button[title="编辑组件"]').first()
    await expect(editButton).toBeVisible()
    await editButton.click()

    const editorModal = page.getByRole('dialog', { name: /字段配置 ·/ })
    await expect(editorModal).toBeVisible()

    await expect(editorModal.getByRole('button', { name: /^配置$/ })).toBeVisible()
    await expect(editorModal.getByRole('button', { name: /^组件预览$/ })).toBeVisible()

    await editorModal.getByRole('button', { name: /^组件预览$/ }).click()
    const previewCards = editorModal.locator('.tc-preview-grid .tc-preview-card')
    const selectedCards = editorModal.locator('.tc-preview-card--selected')
    expect(await previewCards.count()).toBeGreaterThan(0)
    expect(await selectedCards.count()).toBeGreaterThan(0)

    await editorModal.getByRole('button', { name: '关闭' }).click()
    await expect(editorModal).toBeHidden()
  })
})
