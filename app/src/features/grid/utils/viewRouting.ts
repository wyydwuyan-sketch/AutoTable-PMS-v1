import type { View } from '../types/grid'

export const hasConfiguredFormView = (view: Pick<View, 'type' | 'config'>): boolean => {
  if (view.type !== 'form') {
    return true
  }
  const formSettings = view.config.formSettings
  const hasConfiguredFields = (formSettings?.visibleFieldIds?.length ?? 0) > 0
  const hasConfiguredRules = (formSettings?.cascadeRules?.length ?? 0) > 0
  return hasConfiguredFields || hasConfiguredRules
}

export const buildViewPath = (
  baseId: string,
  tableId: string,
  view: Pick<View, 'id' | 'type' | 'config'>,
): string => {
  const basePath = `/b/${baseId}/t/${tableId}/v/${view.id}`
  if (view.type === 'kanban') {
    return `${basePath}/kanban`
  }
  if (view.type !== 'form') {
    return basePath
  }
  return `${basePath}${hasConfiguredFormView(view) ? '/form' : '/form-setup'}`
}
