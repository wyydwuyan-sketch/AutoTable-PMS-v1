import { expect, test } from './fixtures'
import { loginAsAdmin } from './helpers'

test.describe('看板模块', () => {
  test('可切换到看板视图并展示状态列', async ({ page }) => {
    await loginAsAdmin(page)

    const kanbanViewButton = page.locator('button.sidebar-menu-item', { hasText: '看板' }).first()
    await expect(kanbanViewButton).toBeVisible()
    await kanbanViewButton.click()

    await expect(page).toHaveURL(/\/kanban$/)
    await expect(page.getByText('按状态分列，可拖拽更新状态')).toBeVisible()
    await expect(page.locator('section').filter({ hasText: '待处理' }).first()).toBeVisible()
  })

  test('点击看板卡片可打开记录详情抽屉', async ({ page }) => {
    await loginAsAdmin(page)

    const kanbanViewButton = page.locator('button.sidebar-menu-item', { hasText: '看板' }).first()
    await kanbanViewButton.click()
    await expect(page).toHaveURL(/\/kanban$/)

    const firstCard = page.locator('article[draggable="true"]').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()
    await expect(page.getByText('记录详情')).toBeVisible()
  })
})
