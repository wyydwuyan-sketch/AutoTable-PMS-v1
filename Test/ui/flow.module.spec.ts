import type { Locator, Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  confirmByPrimaryButton,
  createUniqueName,
  loginAsAdmin,
  openSidebarConfig,
} from './helpers'

async function selectAntOption(page: Page, scope: Locator, optionLabel: string): Promise<void> {
  await scope.locator('.ant-select input[role="combobox"]').first().click()
  const dropdown = page.locator('.ant-select-dropdown:visible')
  await expect(dropdown).toBeVisible()
  await dropdown.locator('.ant-select-item-option', { hasText: optionLabel }).first().click()
}

const CONFIG_STRATEGY_BY_FIELD_TYPE: Record<string, { optionLabel: string; expectedTag: string }> = {
  text: { optionLabel: '文本域', expectedTag: 'textarea' },
  date: { optionLabel: '文本输入', expectedTag: 'input' },
  number: { optionLabel: '文本输入', expectedTag: 'input' },
  multiSelect: { optionLabel: '文本域', expectedTag: 'textarea' },
  singleSelect: { optionLabel: '成员选择', expectedTag: 'member' },
  member: { optionLabel: '成员选择', expectedTag: 'member' },
  attachment: { optionLabel: '附件上传', expectedTag: 'upload' },
  image: { optionLabel: '图片上传', expectedTag: 'image' },
}

test.describe('端到端流程', () => {
  test('登录后可完成新增视图、配置字段与配置字段组件', async ({ page }) => {
    test.setTimeout(120_000)

    await loginAsAdmin(page)

    await openSidebarConfig(page, '视图配置', /\/config\/views$/)

    await page.getByRole('button', { name: /新增当前表视图/ }).click()
    const createViewModal = page.getByRole('dialog', { name: '新增视图' })
    await expect(createViewModal).toBeVisible()

    const viewName = createUniqueName('E2E流程视图')
    await createViewModal.locator('input[placeholder="输入视图名称"]').fill(viewName)
    await createViewModal.getByRole('button', { name: /保\s*存/ }).click()
    await confirmByPrimaryButton(page)

    await expect(page).toHaveURL(/\/config\/components\?setup=1$/)
    const setupWizard = page.getByRole('dialog', { name: /初始化视图/ })
    await expect(setupWizard).toBeVisible()

    await setupWizard.getByRole('button', { name: '全不选' }).click()

    const wizardFields = await setupWizard.locator('.vsw-field-item').evaluateAll((items) =>
      items.map((item, index) => {
        const typeText = item.querySelector('.vsw-field-type')?.textContent ?? ''
        const fieldType = (typeText.match(/\(([^)]+)\)/)?.[1] ?? '').trim()
        return {
          index,
          fieldType,
        }
      }),
    )
    expect(wizardFields.length).toBeGreaterThan(1)

    const configurableField = wizardFields.find((field) => !!CONFIG_STRATEGY_BY_FIELD_TYPE[field.fieldType])
    expect(configurableField).toBeTruthy()
    if (!configurableField) {
      throw new Error('No configurable field found in setup wizard.')
    }

    const secondaryField = wizardFields.find((field) => field.index !== configurableField.index) ?? configurableField
    const selectedFieldIndexes =
      secondaryField.index === configurableField.index
        ? [configurableField.index]
        : [configurableField.index, secondaryField.index]

    const wizardCheckboxes = setupWizard.locator('.vsw-field-item input[type="checkbox"]')
    for (const index of selectedFieldIndexes) {
      await wizardCheckboxes.nth(index).check()
    }

    await setupWizard.getByRole('button', { name: '完成初始化' }).click()
    await expect(setupWizard).toBeHidden()
    await expect.poll(() => new URL(page.url()).searchParams.get('setup')).toBe(null)

    const tableSection = page
      .locator('section.tc-table-section', {
        has: page.locator('.tc-stat-item--tableid', { hasText: 'tbl_1' }),
      })
      .first()
    await expect(tableSection).toBeVisible()

    const tableRows = tableSection.locator('.tc-field-row')
    await expect(tableRows.first()).toBeVisible()
    const rowSummaries = await tableRows.evaluateAll((rows) =>
      rows.map((row, index) => {
        const tags = Array.from(row.querySelectorAll('.tc-tag')).map((tag) =>
          (tag.textContent ?? '').trim(),
        )
        return {
          index,
          fieldType: tags[0] ?? '',
          visibility: tags[2] ?? '',
        }
      }),
    )
    const targetRowSummary = rowSummaries.find(
      (row) => row.visibility === '可见' && !!CONFIG_STRATEGY_BY_FIELD_TYPE[row.fieldType],
    )
    expect(targetRowSummary).toBeTruthy()
    if (!targetRowSummary) {
      throw new Error('No configurable visible field found in component table.')
    }

    const targetRow = tableRows.nth(targetRowSummary.index)
    const targetFieldId = (await targetRow.locator('.tc-field-id').innerText()).trim()
    const configStrategy = CONFIG_STRATEGY_BY_FIELD_TYPE[targetRowSummary.fieldType]
    await expect(targetRow).toContainText('默认')
    await targetRow.locator('button[title="编辑组件"]').click()

    const editorModal = page.getByRole('dialog', { name: /字段配置/ })
    await expect(editorModal).toBeVisible()
    await selectAntOption(page, editorModal, configStrategy.optionLabel)
    await editorModal.getByRole('button', { name: '保存配置' }).click()
    await editorModal.getByRole('button', { name: '关闭' }).click()
    await expect(editorModal).toBeHidden()

    const searchInput = tableSection.locator('input[placeholder="搜索字段名 / 类型 / 组件"]').first()

    await searchInput.fill(targetFieldId)
    const configuredVisibleRow = tableSection.locator('.tc-field-row', { hasText: targetFieldId }).first()
    await expect(configuredVisibleRow).toBeVisible()
    await expect(configuredVisibleRow).toContainText(configStrategy.expectedTag)
    await expect(configuredVisibleRow).toContainText('可见')
  })
})
