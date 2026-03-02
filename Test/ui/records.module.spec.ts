import { expect, test } from './fixtures'

import {
  confirmByPrimaryButton,
  createUniqueName,
  expectMainGridReady,
  expectToastContains,
  fillRecordName,
  loginAsAdmin,
  openCreateRecordModal,
} from './helpers'

test.describe('记录模块', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('新增记录弹窗展示基础输入和保存按钮', async ({ page }) => {
    await expectMainGridReady(page)

    const createModal = await openCreateRecordModal(page)
    await expect(createModal.getByRole('button', { name: /保\s*存/ })).toBeVisible()

    const allInputs = createModal.locator('input.cm-input')
    expect(await allInputs.count()).toBeGreaterThan(0)
  })

  test('保存新增记录后出现成功提示', async ({ page }) => {
    const uniqueName = createUniqueName('E2E记录')
    const createModal = await openCreateRecordModal(page)

    await fillRecordName(createModal, uniqueName)
    await createModal.getByRole('button', { name: /保\s*存/ }).click()
    await confirmByPrimaryButton(page)

    await expect(createModal).toBeHidden()
    await expectToastContains(page, '已新增记录。')
  })
})
