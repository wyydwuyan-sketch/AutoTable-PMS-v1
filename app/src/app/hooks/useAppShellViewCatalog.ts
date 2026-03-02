import { useMemo } from 'react'
import type { View } from '../../features/grid/types/grid'
import { useMultiTableViews } from './useMultiTableViews'

type TableItem = {
  id: string
  name: string
}

interface UseAppShellViewCatalogParams {
  tableItems: TableItem[]
  tableId: string
  views: View[]
}

export function useAppShellViewCatalog({
  tableItems,
  tableId,
  views,
}: UseAppShellViewCatalogParams) {
  const tableNameMap = useMemo(
    () => new Map(tableItems.map((item, index) => [item.id, { name: item.name, order: index }])),
    [tableItems],
  )
  const { viewsByTableId, allViews } = useMultiTableViews({
    tableItems,
    storeViews: views,
    activeTableId: tableId,
  })

  const visibleViews = useMemo(
    () =>
      (viewsByTableId[tableId] ?? [])
        .filter((view) => view.tableId === tableId && view.config.isEnabled !== false)
        .sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0)),
    [tableId, viewsByTableId],
  )

  const sidebarVisibleViews = useMemo(() => {
    const merged = new Map<string, View>()

    for (const view of allViews) {
      if (!tableNameMap.has(view.tableId)) continue
      merged.set(view.id, view)
    }

    return [...merged.values()]
      .filter((view) => view.config.isEnabled !== false)
      .sort((a, b) => {
        const ao = tableNameMap.get(a.tableId)?.order ?? Number.MAX_SAFE_INTEGER
        const bo = tableNameMap.get(b.tableId)?.order ?? Number.MAX_SAFE_INTEGER
        if (ao !== bo) return ao - bo

        const av = a.config.order ?? 0
        const bv = b.config.order ?? 0
        if (av !== bv) return av - bv

        return a.name.localeCompare(b.name, 'zh-Hans-CN')
      })
  }, [allViews, tableNameMap])

  return {
    tableNameMap,
    visibleViews,
    sidebarVisibleViews,
  }
}
