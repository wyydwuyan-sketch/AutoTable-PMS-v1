import type { FieldType, FilterDraft } from '../types/grid'

export const newRuleId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
export const newPresetId = () => `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export const defaultOpByType = (fieldType: FieldType | undefined): FilterDraft['op'] => {
  if (fieldType === 'number' || fieldType === 'date') return 'equals'
  if (fieldType === 'singleSelect' || fieldType === 'multiSelect') return 'equals'
  return 'contains'
}

type FilterOpOption = { value: FilterDraft['op']; label: string }

export const getFilterOpsByType = (fieldType: FieldType | undefined): FilterOpOption[] => {
  if (fieldType === 'number' || fieldType === 'date') {
    return [
      { value: 'equals', label: '等于' },
      { value: 'neq', label: '不等于' },
      { value: 'gt', label: '大于' },
      { value: 'gte', label: '大于等于' },
      { value: 'lt', label: '小于' },
      { value: 'lte', label: '小于等于' },
    ]
  }
  if (fieldType === 'singleSelect' || fieldType === 'multiSelect') {
    return [
      { value: 'equals', label: '等于' },
      { value: 'neq', label: '不等于' },
    ]
  }
  return [
    { value: 'contains', label: '包含' },
    { value: 'equals', label: '等于' },
    { value: 'neq', label: '不等于' },
  ]
}

export const normalizeFilterValue = (fields: { id: string, type: FieldType }[], fieldId: string, op: FilterDraft['op'], raw: string): unknown => {
  const field = fields.find((f) => f.id === fieldId)
  if (!field) return raw
  if (field.type === 'number') {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : raw
  }
  if (field.type === 'date') {
    return raw
  }
  if ((field.type === 'singleSelect' || field.type === 'multiSelect') && (op === 'equals' || op === 'neq')) {
    return raw
  }
  return raw
}
