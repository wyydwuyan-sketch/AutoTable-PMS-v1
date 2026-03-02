import type { CascadeRule, Field, FieldComponentConfig, FieldOption } from '../types/grid'

type RowValues = Record<string, unknown>

function findFieldById(fields: Field[], fieldId: string) {
  return fields.find((field) => field.id === fieldId)
}

export function inferCascadeRules(fields: Field[]): CascadeRule[] {
  const rules: CascadeRule[] = []
  const singleSelectFields = fields.filter((field) => field.type === 'singleSelect')

  for (const child of singleSelectFields) {
    const parentIds = Array.from(
      new Set((child.options ?? []).map((option) => option.parentId).filter((v): v is string => !!v)),
    )
    if (parentIds.length === 0) {
      continue
    }
    const parent = singleSelectFields.find((candidate) => {
      if (candidate.id === child.id) {
        return false
      }
      const ids = new Set((candidate.options ?? []).map((option) => option.id))
      return parentIds.every((id) => ids.has(id))
    })
    if (!parent) {
      continue
    }
    rules.push({
      id: `cascade_${parent.id}_${child.id}`,
      name: `${parent.name} -> ${child.name}`,
      parentFieldId: parent.id,
      childFieldId: child.id,
      enabled: true,
      order: rules.length,
    })
  }

  return rules
}

export function getOptionsForField(
  fields: Field[],
  rowValues: RowValues,
  fieldId: string,
  rules: CascadeRule[],
  componentConfigs?: Record<string, FieldComponentConfig>,
): FieldOption[] {
  const field = findFieldById(fields, fieldId)
  if (!field || field.type !== 'singleSelect') {
    return []
  }
  const componentConfig = componentConfigs?.[fieldId]
  if (
    componentConfig?.componentType === 'cascader' &&
    componentConfig.cascader?.parentFieldId
  ) {
    const parentValue = String(rowValues[componentConfig.cascader.parentFieldId] ?? '')
    const children = componentConfig.cascader.mappings[parentValue] ?? []
    return children.map((name) => ({ id: name, name, parentId: parentValue, color: undefined }))
  }
  const rule = rules
    .filter((item) => item.enabled)
    .sort((a, b) => a.order - b.order)
    .find((item) => item.childFieldId === fieldId)
  if (!rule) {
    return field.options ?? []
  }
  const parentValue = String(rowValues[rule.parentFieldId] ?? '')
  if (!parentValue) {
    return field.options ?? []
  }
  return (field.options ?? []).filter((option) => !option.parentId || option.parentId === parentValue)
}

export function buildCascadePatch(
  fields: Field[],
  rowValues: RowValues,
  fieldId: string,
  nextValue: unknown,
  rules: CascadeRule[],
  componentConfigs?: Record<string, FieldComponentConfig>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { [fieldId]: nextValue }
  const affectedRules = rules.filter((rule) => rule.enabled && rule.parentFieldId === fieldId)
  const componentChildren = Object.entries(componentConfigs ?? {})
    .filter(([, config]) => config.componentType === 'cascader' && config.cascader?.parentFieldId === fieldId)
    .map(([childFieldId, config]) => ({
      childFieldId,
      mappings: config.cascader?.mappings ?? {},
    }))
  if (affectedRules.length === 0 && componentChildren.length === 0) {
    return patch
  }

  for (const rule of affectedRules) {
    const childField = findFieldById(fields, rule.childFieldId)
    if (!childField || childField.type !== 'singleSelect') {
      continue
    }
    const childValue = String(rowValues[rule.childFieldId] ?? '')
    if (!childValue) {
      continue
    }
    const childOptions = (childField.options ?? []).filter(
      (option) => !option.parentId || option.parentId === String(nextValue ?? ''),
    )
    const isValid = childOptions.some((option) => option.id === childValue)
    if (!isValid) {
      patch[rule.childFieldId] = null
    }
  }

  for (const child of componentChildren) {
    const childValue = String(rowValues[child.childFieldId] ?? '')
    if (!childValue) {
      continue
    }
    const validValues = child.mappings[String(nextValue ?? '')] ?? []
    if (!validValues.includes(childValue)) {
      patch[child.childFieldId] = null
    }
  }

  return patch
}
