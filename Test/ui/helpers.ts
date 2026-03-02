import { expect, type Locator, type Page } from '@playwright/test'

const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'admin'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'admin123'

export function createUniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

export async function gotoLogin(page: Page): Promise<void> {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)
}

export async function expectMainGridReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/b\/base_1\/t\/.+\/v\/.+/)
  await expect(page.locator('.grid-root')).toBeVisible()
  await expect(page.getByRole('button', { name: '新增记录' })).toBeVisible()
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await gotoLogin(page)

  await page.locator('input.cm-input').nth(0).fill(ADMIN_USERNAME)
  await page.locator('input.cm-input').nth(1).fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expectMainGridReady(page)
}

export function getSidebarMenuButton(page: Page, label: string): Locator {
  return page.locator('button.sidebar-menu-item', { hasText: label }).first()
}

export async function openSidebarConfig(
  page: Page,
  label: string,
  expectedUrlPattern?: RegExp,
): Promise<void> {
  const button = getSidebarMenuButton(page, label)
  await expect(button).toBeVisible()
  await button.click()

  if (expectedUrlPattern) {
    await expect(page).toHaveURL(expectedUrlPattern)
  }
}

export async function confirmByPrimaryButton(page: Page): Promise<void> {
  const okButton = page.locator('#__confirm_ok')
  await expect(okButton).toBeVisible()
  await okButton.click()
}

export async function openCreateRecordModal(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: '新增记录' }).click()
  const createModal = page.getByRole('dialog', { name: '新增记录' })
  await expect(createModal).toBeVisible()
  return createModal
}

export async function fillRecordName(createModal: Locator, name: string): Promise<void> {
  const nameInput = createModal.locator('.form-group:has(label:has-text("名称")) input.cm-input').first()
  if (await nameInput.count()) {
    await nameInput.fill(name)
    return
  }

  await createModal.locator('input.cm-input').first().fill(name)
}

export async function expectToastContains(page: Page, text: string): Promise<void> {
  await expect(page.locator('.grid-toast')).toContainText(text)
}
