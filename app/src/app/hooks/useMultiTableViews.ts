import { useCallback, useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../features/grid/api'
import type { View } from '../../features/grid/types/grid'
import { invalidateViewCatalog, useViewCatalogVersion } from './catalogRefreshBus'

type TableItemLike = {
  id: string
  name: string
}

export interface UseMultiTableViewsParams {
  tableItems: Array<TableItemLike>
  storeViews: View[]
  activeTableId: string
}

export interface UseMultiTableViewsResult {
  viewsByTableId: Record<string, View[]>
  allViews: View[]
  isLoading: boolean
  refreshViews: () => void
}

const buildEmptyViewMap = (tableItems: TableItemLike[]) =>
  tableItems.reduce<Record<string, View[]>>((acc, item) => {
    acc[item.id] = []
    return acc
  }, {})

export function useMultiTableViews({
  tableItems,
  storeViews,
  activeTableId,
}: UseMultiTableViewsParams): UseMultiTableViewsResult {
  const [snapshotViewsByTableId, setSnapshotViewsByTableId] = useState<Record<string, View[]>>(() => buildEmptyViewMap(tableItems))
  const [isLoading, setIsLoading] = useState(false)
  const refreshVersion = useViewCatalogVersion()

  const tableIdsKey = useMemo(() => tableItems.map((item) => item.id).join('|'), [tableItems])

  const refreshViews = useCallback(() => {
    invalidateViewCatalog()
  }, [])

  useEffect(() => {
    if (tableItems.length === 0) {
      setSnapshotViewsByTableId({})
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)

    void (async () => {
      const entries: Array<[string, View[]]> = await Promise.all(
        tableItems.map(async (item) => {
          try {
            const views = await gridApiClient.getViews(item.id)
            return [item.id, views.filter((view) => view.tableId === item.id)]
          } catch (error) {
            console.error(`[useMultiTableViews] 加载数据表视图失败: ${item.id}`, error)
            return [item.id, []]
          }
        }),
      )

      if (!active) return

      const nextMap = buildEmptyViewMap(tableItems)
      for (const [tableId, views] of entries) {
        nextMap[tableId] = views
      }
      setSnapshotViewsByTableId(nextMap)
      setIsLoading(false)
    })()

    return () => {
      active = false
    }
  }, [refreshVersion, tableIdsKey, tableItems])

  const viewsByTableId = useMemo(() => {
    const nextMap = buildEmptyViewMap(tableItems)

    for (const item of tableItems) {
      nextMap[item.id] = snapshotViewsByTableId[item.id] ?? []
    }

    const activeStoreViews = storeViews.filter((view) => view.tableId === activeTableId)
    if (activeStoreViews.length > 0) {
      nextMap[activeTableId] = activeStoreViews
    }

    return nextMap
  }, [activeTableId, snapshotViewsByTableId, storeViews, tableItems])

  const allViews = useMemo(
    () => tableItems.flatMap((item) => viewsByTableId[item.id] ?? []),
    [tableItems, viewsByTableId],
  )

  return {
    viewsByTableId,
    allViews,
    isLoading,
    refreshViews,
  }
}
