import { useCallback, useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../features/grid/api'
import type { TableCatalogItem, View, ViewCatalog } from '../../features/grid/types/grid'

interface UseMultiTableViewCatalogParams {
  tableItems: TableCatalogItem[]
}

interface UseMultiTableViewCatalogResult {
  catalogsByTableId: Record<string, ViewCatalog>
  allViews: View[]
  isLoading: boolean
  refreshCatalogs: () => void
}

const buildEmptyCatalogMap = (tableItems: TableCatalogItem[]) =>
  tableItems.reduce<Record<string, ViewCatalog>>((acc, item) => {
    acc[item.id] = {
      tableId: item.id,
      folders: [],
    }
    return acc
  }, {})

const flattenViews = (catalog: ViewCatalog) =>
  catalog.folders.flatMap((folder) => folder.primaryViews.flatMap((item) => [item.view, ...item.derivedViews]))

export function useMultiTableViewCatalog({
  tableItems,
}: UseMultiTableViewCatalogParams): UseMultiTableViewCatalogResult {
  const [catalogsByTableId, setCatalogsByTableId] = useState<Record<string, ViewCatalog>>(() => buildEmptyCatalogMap(tableItems))
  const [isLoading, setIsLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const refreshCatalogs = useCallback(() => {
    setRefreshTick((current) => current + 1)
  }, [])

  const tableIdsKey = useMemo(() => tableItems.map((item) => item.id).join('|'), [tableItems])

  useEffect(() => {
    if (tableItems.length === 0) {
      setCatalogsByTableId({})
      setIsLoading(false)
      return
    }

    let active = true
    setIsLoading(true)

    void (async () => {
      const entries = await Promise.all(
        tableItems.map(async (item) => {
          try {
            return [item.id, await gridApiClient.getViewCatalog(item.id)] as const
          } catch (error) {
            console.error(`[useMultiTableViewCatalog] 加载视图目录失败: ${item.id}`, error)
            return [
              item.id,
              {
                tableId: item.id,
                folders: [],
              } as ViewCatalog,
            ] as const
          }
        }),
      )

      if (!active) return

      setCatalogsByTableId(
        entries.reduce<Record<string, ViewCatalog>>((acc, [tableId, catalog]) => {
          acc[tableId] = catalog
          return acc
        }, buildEmptyCatalogMap(tableItems)),
      )
      setIsLoading(false)
    })()

    return () => {
      active = false
    }
  }, [refreshTick, tableIdsKey, tableItems])

  const allViews = useMemo(
    () => tableItems.flatMap((item) => flattenViews(catalogsByTableId[item.id] ?? { tableId: item.id, folders: [] })),
    [catalogsByTableId, tableItems],
  )

  return {
    catalogsByTableId,
    allViews,
    isLoading,
    refreshCatalogs,
  }
}
