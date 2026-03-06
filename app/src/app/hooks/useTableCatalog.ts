import { useCallback, useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../features/grid/api'
import type { TableCatalogItem } from '../../features/grid/types/grid'
import { invalidateTableCatalog, useTableCatalogVersion } from './catalogRefreshBus'

const DEFAULT_BASE_ID = 'base_1'

export interface UseTableCatalogResult {
  tables: TableCatalogItem[]
  isLoading: boolean
  error: string | null
  refreshTables: () => void
}

export function useTableCatalog(baseId?: string): UseTableCatalogResult {
  const resolvedBaseId = (baseId || DEFAULT_BASE_ID).trim() || DEFAULT_BASE_ID
  const [tables, setTables] = useState<TableCatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refreshVersion = useTableCatalogVersion(resolvedBaseId)

  const refreshTables = useCallback(() => {
    invalidateTableCatalog(resolvedBaseId)
  }, [resolvedBaseId])

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setError(null)

    void (async () => {
      try {
        const items = await gridApiClient.getTables(resolvedBaseId)
        if (!active) return
        setTables(items)
      } catch (error) {
        if (!active) return
        console.error('[useTableCatalog] 加载数据表目录失败', error)
        setTables([])
        setError(error instanceof Error ? error.message : '加载数据表目录失败')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      active = false
    }
  }, [refreshVersion, resolvedBaseId])

  return useMemo(
    () => ({
      tables,
      isLoading,
      error,
      refreshTables,
    }),
    [error, isLoading, refreshTables, tables],
  )
}
