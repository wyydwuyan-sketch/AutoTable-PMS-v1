import { useCallback, useState } from 'react'
import { gridApiClient } from '../api'
import { useGridStore } from '../store/gridStore'
import type { FieldComponentConfig, FieldComponentType, View, ViewConfig } from '../types/grid'
import { getApiErrorMessage } from '../../../utils/apiError'

interface UseViewComponentConfigMutationParams {
  routeTableId: string
  routeViewId: string
  viewsByTableId: Record<string, View[]>
  refreshViews?: () => void
}

interface SaveFieldComponentTypeParams {
  targetTableId: string
  targetViewId: string
  fieldId: string
  componentType: FieldComponentType
}

interface SaveFieldComponentConfigParams {
  targetTableId: string
  targetViewId: string
  fieldId: string
  config?: FieldComponentConfig
}

export function useViewComponentConfigMutation({
  routeTableId,
  routeViewId,
  viewsByTableId,
  refreshViews,
}: UseViewComponentConfigMutationParams) {
  const activeViewId = useGridStore((state) => state.activeViewId)
  const updateViewConfig = useGridStore((state) => state.updateViewConfig)
  const setToast = useGridStore((state) => state.setToast)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const patchTargetViewConfig = useCallback(
    async (targetTableId: string, targetViewId: string, patch: Partial<ViewConfig>) => {
      const targetView = (viewsByTableId[targetTableId] ?? []).find((view) => view.id === targetViewId)
      if (!targetView) {
        setToast('目标视图不存在或尚未加载完成。', 'warning')
        return null
      }

      const nextConfig: ViewConfig = { ...targetView.config, ...patch }
      const currentRuntimeViewId = activeViewId ?? routeViewId
      const isCurrentRouteView = targetTableId === routeTableId && targetViewId === currentRuntimeViewId

      if (isCurrentRouteView) {
        updateViewConfig(patch)
        return { ...targetView, config: nextConfig }
      }

      try {
        const updated = await gridApiClient.updateView(targetViewId, { config: nextConfig })
        refreshViews?.()
        return updated
      } catch (error) {
        setToast(getApiErrorMessage(error, '更新视图组件配置失败。'), 'error')
        return null
      }
    },
    [activeViewId, refreshViews, routeTableId, routeViewId, setToast, updateViewConfig, viewsByTableId],
  )

  const saveFieldComponentConfig = useCallback(
    async ({
      targetTableId,
      targetViewId,
      fieldId,
      config,
    }: SaveFieldComponentConfigParams) => {
      const targetView = (viewsByTableId[targetTableId] ?? []).find((view) => view.id === targetViewId)
      if (!targetView) {
        setToast('目标视图不存在或尚未加载完成。', 'warning')
        return null
      }

      const nextComponents = { ...(targetView.config.components ?? {}) }
      if (!config || config.componentType === 'default') {
        delete nextComponents[fieldId]
      } else {
        nextComponents[fieldId] = config
      }

      const requestKey = `${targetTableId}:${targetViewId}:${fieldId}:${config?.componentType ?? 'default'}`
      setSavingKey(requestKey)
      try {
        return await patchTargetViewConfig(targetTableId, targetViewId, {
          components: nextComponents,
        })
      } finally {
        setSavingKey((current) => (current === requestKey ? null : current))
      }
    },
    [patchTargetViewConfig, setToast, viewsByTableId],
  )

  const saveFieldComponentType = useCallback(
    async ({
      targetTableId,
      targetViewId,
      fieldId,
      componentType,
    }: SaveFieldComponentTypeParams) => {
      const targetView = (viewsByTableId[targetTableId] ?? []).find((view) => view.id === targetViewId)
      if (!targetView) {
        setToast('目标视图不存在或尚未加载完成。', 'warning')
        return null
      }

      const existingFieldConfig = (targetView.config.components ?? {})[fieldId]
      let nextFieldConfig: FieldComponentConfig | undefined
      if (componentType !== 'default') {
        nextFieldConfig = { componentType }
        if (componentType === 'select' && existingFieldConfig?.options) {
          nextFieldConfig.options = existingFieldConfig.options
        }
        if (componentType === 'cascader' && existingFieldConfig?.cascader) {
          nextFieldConfig.cascader = existingFieldConfig.cascader
        }
      }

      return await saveFieldComponentConfig({
        targetTableId,
        targetViewId,
        fieldId,
        config: nextFieldConfig,
      })
    },
    [saveFieldComponentConfig, setToast, viewsByTableId],
  )

  return {
    savingKey,
    isSaving: savingKey !== null,
    saveFieldComponentConfig,
    saveFieldComponentType,
  }
}
