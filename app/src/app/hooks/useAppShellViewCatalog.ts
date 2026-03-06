import { useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../features/grid/api'
import type { TableCatalogItem, View, ViewCatalog, ViewCatalogItem, ViewFolderCatalog } from '../../features/grid/types/grid'
import { useViewCatalogVersion } from './catalogRefreshBus'

interface UseAppShellViewCatalogParams {
  tableItems: TableCatalogItem[]
  tableId: string
  viewId: string
  views: View[]
}

const buildEmptyCatalog = (tableId: string): ViewCatalog => ({
  tableId,
  folders: [],
})

const getViewOrder = (view: View) => view.config.order ?? 0

const sortViews = (left: View, right: View) => {
  const orderDelta = getViewOrder(left) - getViewOrder(right)
  if (orderDelta !== 0) return orderDelta
  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

const cloneView = (view: View): View => ({
  ...view,
  folderId: view.folderId ?? null,
  sourceViewId: view.sourceViewId ?? null,
  viewRole: view.viewRole ?? (view.sourceViewId ? 'derived' : 'primary'),
})

const normalizeCatalog = (catalog: ViewCatalog): ViewCatalog => ({
  tableId: catalog.tableId,
  folders: (catalog.folders ?? [])
    .map((folder) => ({
      ...folder,
      primaryViews: (folder.primaryViews ?? [])
        .map((item) => ({
          view: cloneView(item.view),
          derivedViews: (item.derivedViews ?? []).map(cloneView).sort(sortViews),
        }))
        .sort((left, right) => sortViews(left.view, right.view)),
    }))
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    }),
})

const buildCatalogFromViews = (
  tableItem: TableCatalogItem,
  tableViews: View[],
  snapshot?: ViewCatalog,
): ViewCatalog => {
  const normalizedSnapshot = snapshot ? normalizeCatalog(snapshot) : undefined
  const snapshotFolders = normalizedSnapshot?.folders ?? []
  const defaultFolder =
    snapshotFolders[0] ??
    ({
      id: `folder:${tableItem.id}`,
      tableId: tableItem.id,
      name: tableItem.name,
      sortOrder: 0,
      isEnabled: true,
      primaryViews: [],
    } satisfies ViewFolderCatalog)

  const folderMap = new Map(
    [defaultFolder, ...snapshotFolders].map((folder) => [
      folder.id,
      {
        id: folder.id,
        tableId: folder.tableId,
        name: folder.name,
        sortOrder: folder.sortOrder,
        isEnabled: folder.isEnabled,
      },
    ]),
  )
  const primaryById = new Map<string, ViewCatalogItem>()

  tableViews
    .filter((view) => (view.viewRole ?? (view.sourceViewId ? 'derived' : 'primary')) !== 'derived')
    .sort(sortViews)
    .forEach((view) => {
      const normalized = cloneView(view)
      const folderId = normalized.folderId ?? defaultFolder.id
      if (!folderMap.has(folderId)) {
        folderMap.set(folderId, {
          id: folderId,
          tableId: tableItem.id,
          name: tableItem.name,
          sortOrder: folderMap.size,
          isEnabled: true,
        })
      }
      primaryById.set(normalized.id, {
        view: {
          ...normalized,
          folderId,
          sourceViewId: null,
          viewRole: 'primary',
        },
        derivedViews: [],
      })
    })

  tableViews
    .filter((view) => (view.viewRole ?? (view.sourceViewId ? 'derived' : 'primary')) === 'derived')
    .sort(sortViews)
    .forEach((view) => {
      const normalized = cloneView(view)
      const owner = normalized.sourceViewId ? primaryById.get(normalized.sourceViewId) : null
      if (!owner) return
      owner.derivedViews.push({
        ...normalized,
        folderId: owner.view.folderId ?? defaultFolder.id,
        sourceViewId: normalized.sourceViewId ?? owner.view.id,
        viewRole: 'derived',
      })
    })

  const folders = [...folderMap.values()]
    .map((folder) => ({
      ...folder,
      primaryViews: [...primaryById.values()]
        .filter((item) => (item.view.folderId ?? defaultFolder.id) === folder.id)
        .map((item) => ({
          view: item.view,
          derivedViews: [...item.derivedViews].sort(sortViews),
        }))
        .sort((left, right) => sortViews(left.view, right.view)),
    }))
    .filter((folder) => folder.primaryViews.length > 0)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
      return left.name.localeCompare(right.name, 'zh-Hans-CN')
    })

  return {
    tableId: tableItem.id,
    folders,
  }
}

const flattenCatalogViews = (catalog: ViewCatalog) =>
  catalog.folders.flatMap((folder) => folder.primaryViews.flatMap((item) => [item.view, ...item.derivedViews]))

export function useAppShellViewCatalog({
  tableItems,
  tableId,
  viewId,
  views,
}: UseAppShellViewCatalogParams) {
  const [snapshotCatalogsByTableId, setSnapshotCatalogsByTableId] = useState<Record<string, ViewCatalog>>({})
  const refreshVersion = useViewCatalogVersion()

  useEffect(() => {
    if (tableItems.length === 0) {
      setSnapshotCatalogsByTableId({})
      return
    }

    let active = true

    void (async () => {
      const entries = await Promise.all(
        tableItems.map(async (item) => {
          try {
            const catalog = await gridApiClient.getViewCatalog(item.id)
            return [item.id, normalizeCatalog(catalog)] as const
          } catch (error) {
            console.error(`[useAppShellViewCatalog] 加载视图目录失败: ${item.id}`, error)
            return [item.id, buildEmptyCatalog(item.id)] as const
          }
        }),
      )

      if (!active) return

      setSnapshotCatalogsByTableId(
        entries.reduce<Record<string, ViewCatalog>>((acc, [nextTableId, catalog]) => {
          acc[nextTableId] = catalog
          return acc
        }, {}),
      )
    })()

    return () => {
      active = false
    }
  }, [refreshVersion, tableItems])

  const tableNameMap = useMemo(
    () => new Map(tableItems.map((item, index) => [item.id, { name: item.name, order: index }])),
    [tableItems],
  )

  const activeTableViews = useMemo(
    () => views.filter((view) => view.tableId === tableId),
    [tableId, views],
  )

  const catalogsByTableId = useMemo(() => {
    const nextCatalogs: Record<string, ViewCatalog> = {}

    for (const item of tableItems) {
      const snapshot = snapshotCatalogsByTableId[item.id]
      if (item.id === tableId && activeTableViews.length > 0) {
        nextCatalogs[item.id] = buildCatalogFromViews(item, activeTableViews, snapshot)
        continue
      }
      nextCatalogs[item.id] = snapshot ?? buildCatalogFromViews(item, [], undefined)
    }

    return nextCatalogs
  }, [activeTableViews, snapshotCatalogsByTableId, tableId, tableItems])

  const visibleViews = useMemo(
    () => flattenCatalogViews(catalogsByTableId[tableId] ?? buildEmptyCatalog(tableId)),
    [catalogsByTableId, tableId],
  )

  const allVisibleViews = useMemo(
    () =>
      tableItems.flatMap((item) =>
        flattenCatalogViews(catalogsByTableId[item.id] ?? buildEmptyCatalog(item.id)),
      ),
    [catalogsByTableId, tableItems],
  )

  const sidebarFolders = useMemo(
    () =>
      tableItems
        .flatMap((item, index) =>
          (catalogsByTableId[item.id]?.folders ?? []).map((folder) => ({
            id: folder.id,
            tableId: item.id,
            tableName: item.name,
            tableOrder: index,
            name: folder.name,
            sortOrder: folder.sortOrder,
            isEnabled: folder.isEnabled,
            primaryViews: folder.primaryViews.map((entry) => entry.view),
          })),
        )
        .filter((folder) => folder.isEnabled !== false)
        .sort((left, right) => {
          if (left.tableOrder !== right.tableOrder) return left.tableOrder - right.tableOrder
          if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder
          return left.name.localeCompare(right.name, 'zh-Hans-CN')
        }),
    [catalogsByTableId, tableItems],
  )

  const activePrimaryMatch = useMemo(() => {
    const activeCatalog = catalogsByTableId[tableId]
    if (!activeCatalog) return null

    for (const folder of activeCatalog.folders) {
      for (const item of folder.primaryViews) {
        if (item.view.id === viewId || item.derivedViews.some((view) => view.id === viewId)) {
          return { folder, item }
        }
      }
    }

    const fallbackFolder = activeCatalog.folders[0]
    const fallbackItem = fallbackFolder?.primaryViews[0]
    return fallbackFolder && fallbackItem ? { folder: fallbackFolder, item: fallbackItem } : null
  }, [catalogsByTableId, tableId, viewId])

  const activeFolder = activePrimaryMatch?.folder ?? null
  const activePrimaryView = activePrimaryMatch?.item.view ?? null
  const activeModeViews = activePrimaryMatch ? [activePrimaryMatch.item.view, ...activePrimaryMatch.item.derivedViews] : []

  return {
    tableNameMap,
    visibleViews,
    allVisibleViews,
    sidebarFolders,
    activeFolder,
    activePrimaryView,
    activeModeViews,
  }
}
