import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import {
  AppstoreOutlined,
  FolderOpenOutlined,
  FormOutlined,
  PlusOutlined,
  ProjectOutlined,
  SettingOutlined,
  TableOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { DropdownMenu } from '../components/DropdownMenu'
import { CustomModal } from '../components/CustomModal'
import { CustomSelect } from '../components/CustomSelect'
import { useGridStore } from '../store/gridStore'
import type { TableButtonPermissionItem, TableButtonPermissions, View, ViewCatalog, ViewFolderCatalog } from '../types/grid'
import { gridApiClient } from '../api'
import { buildViewPath } from '../utils/viewRouting'
import { confirmAction } from '../../../utils/confirmAction'
import { useMultiTableFields } from '../../../app/hooks/useMultiTableFields'
import { useMultiTableViewCatalog } from '../../../app/hooks/useMultiTableViewCatalog'
import { useTableCatalog } from '../../../app/hooks/useTableCatalog'
import './ViewManagement.css'

const flattenCatalogViews = (catalog?: ViewCatalog) =>
  (catalog?.folders ?? []).flatMap((folder) => folder.primaryViews.flatMap((item) => [item.view, ...item.derivedViews]))

const defaultTableButtonPermissions: TableButtonPermissions = {
  canCreateRecord: true,
  canDeleteRecord: true,
  canImportRecords: true,
  canExportRecords: true,
  canManageFilters: true,
  canManageSorts: true,
}

const tableButtonPermissionItems: Array<{ key: keyof TableButtonPermissions; label: string }> = [
  { key: 'canCreateRecord', label: '新增记录' },
  { key: 'canDeleteRecord', label: '删除记录' },
  { key: 'canImportRecords', label: '导入记录' },
  { key: 'canExportRecords', label: '导出数据' },
  { key: 'canManageFilters', label: '筛选配置' },
  { key: 'canManageSorts', label: '排序配置' },
]

const serializeButtonPermissionRows = (rows: TableButtonPermissionItem[]) =>
  JSON.stringify(
    [...rows]
      .sort((a, b) => a.userId.localeCompare(b.userId))
      .map((row) => ({
        userId: row.userId,
        buttons: {
          canCreateRecord: !!row.buttons.canCreateRecord,
          canDeleteRecord: !!row.buttons.canDeleteRecord,
          canImportRecords: !!row.buttons.canImportRecords,
          canExportRecords: !!row.buttons.canExportRecords,
          canManageFilters: !!row.buttons.canManageFilters,
          canManageSorts: !!row.buttons.canManageSorts,
        },
      })),
  )

const getViewTypeLabel = (view: View) => {
  if ((view.viewRole ?? 'primary') === 'primary') return '表格主视图'
  if (view.type === 'kanban') return '数据看板'
  if (view.type === 'form') return '表单视图'
  return view.type
}

const getViewIcon = (view: View) => {
  if ((view.viewRole ?? 'primary') === 'primary') return <TableOutlined />
  if (view.type === 'kanban') return <ProjectOutlined />
  if (view.type === 'form') return <FormOutlined />
  return <AppstoreOutlined />
}

const getViewConfigPath = (baseId: string, view: View) =>
  view.type === 'form'
    ? `/b/${baseId}/t/${view.tableId}/v/${view.id}/form-setup`
    : `/b/${baseId}/t/${view.tableId}/v/${view.id}/config/components`

type ViewCreationMode = 'primary' | 'derived'

export function ViewManagement() {
  const navigate = useNavigate()
  const location = useLocation()
  const { baseId = 'base_1', tableId = '', viewId = '' } = useParams()
  const { tables: tableItems, isLoading: tableCatalogLoading, refreshTables } = useTableCatalog(baseId)
  const setToast = useGridStore((state) => state.setToast)

  const [isCreatingTable, setIsCreatingTable] = useState(false)
  const [tableActionTableId, setTableActionTableId] = useState<string | null>(null)
  const [newViewName, setNewViewName] = useState('')
  const [newViewMode, setNewViewMode] = useState<ViewCreationMode>('primary')
  const [newViewType, setNewViewType] = useState<'grid' | 'form' | 'kanban'>('grid')
  const [newFormMode, setNewFormMode] = useState<'setup' | 'quick'>('setup')
  const [newViewTargetTableId, setNewViewTargetTableId] = useState(tableId)
  const [newViewTargetFolderId, setNewViewTargetFolderId] = useState('')
  const [newViewSourceViewId, setNewViewSourceViewId] = useState('')
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false)
  const [isCreatingView, setIsCreatingView] = useState(false)
  const [isImportingView, setIsImportingView] = useState(false)
  const [importTargetTableId, setImportTargetTableId] = useState(tableId)
  const [importTargetFolderId, setImportTargetFolderId] = useState('')
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [movingPrimaryViewId, setMovingPrimaryViewId] = useState<string | null>(null)
  const [movePrimaryTargetFolderId, setMovePrimaryTargetFolderId] = useState('')
  const [isMovingPrimaryView, setIsMovingPrimaryView] = useState(false)
  const [buttonPermissionRows, setButtonPermissionRows] = useState<TableButtonPermissionItem[]>([])
  const [buttonPermissionBaseline, setButtonPermissionBaseline] = useState('[]')
  const [buttonPermissionLoading, setButtonPermissionLoading] = useState(false)
  const [buttonPermissionSaving, setButtonPermissionSaving] = useState(false)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderTableId, setNewFolderTableId] = useState(tableId)
  const importInputRef = useRef<HTMLInputElement>(null)

  const { catalogsByTableId, allViews, isLoading: multiTableCatalogLoading, refreshCatalogs } = useMultiTableViewCatalog({ tableItems })
  const { fieldsByTableId } = useMultiTableFields({ tableItems })

  const sortedViewsByTableId = useMemo(
    () => Object.fromEntries(tableItems.map((item) => [item.id, flattenCatalogViews(catalogsByTableId[item.id])])) as Record<string, View[]>,
    [catalogsByTableId, tableItems],
  )
  const tableNameById = useMemo(
    () => Object.fromEntries(tableItems.map((item) => [item.id, item.name])) as Record<string, string>,
    [tableItems],
  )
  const viewTableSections = useMemo(
    () =>
      tableItems.map((item) => {
        const folders = catalogsByTableId[item.id]?.folders ?? []
        const views = flattenCatalogViews(catalogsByTableId[item.id])
        const enabledViews = views.filter((view) => view.config.isEnabled !== false).length
        const derivedCount = folders.reduce((count, folder) => count + folder.primaryViews.reduce((acc, entry) => acc + entry.derivedViews.length, 0), 0)
        return {
          tableId: item.id,
          tableName: item.name,
          folders,
          primaryCount: folders.reduce((count, folder) => count + folder.primaryViews.length, 0),
          derivedCount,
          enabledViews,
        }
      }),
    [catalogsByTableId, tableItems],
  )
  const editView = allViews.find((item) => item.id === editingViewId) ?? undefined
  const movingPrimaryView = movingPrimaryViewId ? allViews.find((item) => item.id === movingPrimaryViewId) ?? undefined : undefined
  const hasCreateViewDraft = newViewName.trim().length > 0 || newViewMode !== 'primary' || newFormMode !== 'setup'
  const hasCreateFolderDraft = newFolderName.trim().length > 0
  const hasButtonPermissionDraft =
    editView?.type === 'grid' && serializeButtonPermissionRows(buttonPermissionRows) !== buttonPermissionBaseline

  useEffect(() => {
    if (tableItems.length === 0) return
    const fallbackTableId = tableItems.some((item) => item.id === tableId) ? tableId : tableItems[0].id
    if (!tableItems.some((item) => item.id === newViewTargetTableId)) setNewViewTargetTableId(fallbackTableId)
    if (!tableItems.some((item) => item.id === importTargetTableId)) setImportTargetTableId(fallbackTableId)
    if (!tableItems.some((item) => item.id === newFolderTableId)) setNewFolderTableId(fallbackTableId)
  }, [importTargetTableId, newFolderTableId, newViewTargetTableId, tableId, tableItems])

  useEffect(() => {
    const folders = catalogsByTableId[importTargetTableId]?.folders ?? []
    if (!folders.some((folder) => folder.id === importTargetFolderId)) {
      setImportTargetFolderId('')
    }
  }, [catalogsByTableId, importTargetFolderId, importTargetTableId])

  useEffect(() => {
    if (!movingPrimaryViewId) return
    const target = allViews.find((view) => view.id === movingPrimaryViewId)
    if (!target) return
    const folders = catalogsByTableId[target.tableId]?.folders ?? []
    if (!folders.some((folder) => folder.id === movePrimaryTargetFolderId)) {
      const fallbackFolderId =
        folders.find((folder) => folder.id !== target.folderId)?.id ??
        target.folderId ??
        folders[0]?.id ??
        ''
      setMovePrimaryTargetFolderId(fallbackFolderId)
    }
  }, [allViews, catalogsByTableId, movePrimaryTargetFolderId, movingPrimaryViewId])

  useEffect(() => {
    const folders = catalogsByTableId[newViewTargetTableId]?.folders ?? []
    const primaryViews = folders.flatMap((folder) => folder.primaryViews.map((entry) => entry.view))
    if (newViewMode === 'primary') {
      if (!folders.some((folder) => folder.id === newViewTargetFolderId)) {
        setNewViewTargetFolderId(folders[0]?.id ?? '')
      }
      return
    }
    if (!primaryViews.some((view) => view.id === newViewSourceViewId)) {
      setNewViewSourceViewId(primaryViews[0]?.id ?? '')
    }
  }, [catalogsByTableId, newViewMode, newViewSourceViewId, newViewTargetFolderId, newViewTargetTableId])

  useEffect(() => {
    if (!editView || editView.type !== 'grid') {
      setButtonPermissionRows([])
      setButtonPermissionBaseline('[]')
      return
    }
    let active = true
    setButtonPermissionLoading(true)
    void (async () => {
      try {
        const rows = await gridApiClient.getTableButtonPermissions(editView.tableId)
        if (!active) return
        setButtonPermissionRows(rows)
        setButtonPermissionBaseline(serializeButtonPermissionRows(rows))
      } catch {
        if (!active) return
        setButtonPermissionRows([])
        setButtonPermissionBaseline('[]')
        setToast('加载表格按钮权限失败。')
      } finally {
        if (active) setButtonPermissionLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [editView, setToast])

  const promptForInputText = async (title: string, initialValue = '', placeholder = '请输入内容') => {
    const { promptForText } = await import('../../../utils/promptForText')
    return promptForText(title, initialValue, placeholder)
  }

  const handleCreateTable = async () => {
    if (isCreatingTable) return
    const nextName = await promptForInputText('请输入新数据表名称', '', '数据表名称')
    if (!nextName) return
    const trimmedName = nextName.trim()
    if (!trimmedName) {
      setToast('请先输入数据表名称。')
      return
    }
    setIsCreatingTable(true)
    try {
      const created = await gridApiClient.createTable(baseId, trimmedName)
      refreshTables()
      setToast(`数据表「${created.name}」已创建。`)
    } catch {
      setToast('创建数据表失败。')
    } finally {
      setIsCreatingTable(false)
    }
  }

  const goToView = (targetView: View) => {
    navigate(buildViewPath(baseId, targetView.tableId, targetView))
  }

  const resetCreateViewDraft = () => {
    const targetTableId = tableId || tableItems[0]?.id || ''
    const folders = catalogsByTableId[targetTableId]?.folders ?? []
    const primaryViews = folders.flatMap((folder) => folder.primaryViews.map((entry) => entry.view))
    setNewViewName('')
    setNewViewMode('primary')
    setNewViewType('grid')
    setNewFormMode('setup')
    setNewViewTargetTableId(targetTableId)
    setNewViewTargetFolderId(folders[0]?.id ?? '')
    setNewViewSourceViewId(primaryViews[0]?.id ?? '')
  }

  const openCreateViewModal = (targetTableId = tableId, options?: { mode?: ViewCreationMode; folderId?: string | null; sourceViewId?: string | null }) => {
    const mode = options?.mode ?? 'primary'
    const folders = catalogsByTableId[targetTableId]?.folders ?? []
    const primaryViews = folders.flatMap((folder) => folder.primaryViews.map((entry) => entry.view))
    setNewViewName('')
    setNewViewMode(mode)
    setNewViewType(mode === 'primary' ? 'grid' : 'kanban')
    setNewFormMode('setup')
    setNewViewTargetTableId(targetTableId)
    setNewViewTargetFolderId(options?.folderId ?? folders[0]?.id ?? '')
    setNewViewSourceViewId(options?.sourceViewId ?? primaryViews[0]?.id ?? '')
    setIsCreateViewOpen(true)
  }

  const openCreateFolderModal = (targetTableId = tableId) => {
    setNewFolderName('')
    setNewFolderTableId(targetTableId)
    setIsCreateFolderOpen(true)
  }

  const openMovePrimaryViewModal = (targetView: View) => {
    const folders = catalogsByTableId[targetView.tableId]?.folders ?? []
    if (folders.filter((folder) => folder.id !== targetView.folderId).length === 0) {
      setToast('当前数据表只有一个菜单，无法移动主视图。')
      return
    }
    const fallbackFolderId =
      folders.find((folder) => folder.id !== targetView.folderId)?.id ??
      targetView.folderId ??
      folders[0]?.id ??
      ''
    setMovingPrimaryViewId(targetView.id)
    setMovePrimaryTargetFolderId(fallbackFolderId)
  }

  const getFallbackViewAfterDelete = (target: View) => {
    const sameTableViews = sortedViewsByTableId[target.tableId] ?? []
    const candidateViews = sameTableViews.filter((view) => view.id !== target.id && view.sourceViewId !== target.id)
    if (target.sourceViewId) {
      return candidateViews.find((view) => view.id === target.sourceViewId) ?? candidateViews[0] ?? null
    }
    return candidateViews[0] ?? null
  }
  const handleCreateFolder = async () => {
    if (isCreatingFolder) return
    const name = newFolderName.trim()
    if (!name) {
      setToast('请先输入菜单名称。')
      return
    }
    const confirmed = await confirmAction({ title: `确认创建菜单「${name}」？`, okText: '确认创建' })
    if (!confirmed) return
    setIsCreatingFolder(true)
    try {
      await gridApiClient.createViewFolder(newFolderTableId || tableId, name)
      refreshCatalogs()
      setIsCreateFolderOpen(false)
      setNewFolderName('')
      setToast('菜单已创建。')
    } catch {
      setToast('创建菜单失败。')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const closeCreateFolderModal = async () => {
    if (isCreatingFolder) return
    if (!hasCreateFolderDraft) {
      setIsCreateFolderOpen(false)
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的菜单信息？',
      content: '关闭后当前菜单名称将丢失。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    setNewFolderName('')
    setIsCreateFolderOpen(false)
  }

  const handleRenameFolder = async (folder: ViewFolderCatalog) => {
    const nextName = await promptForInputText('请输入新的菜单名称', folder.name, '菜单名称')
    if (!nextName) return
    try {
      await gridApiClient.updateViewFolder(folder.id, { name: nextName.trim() })
      refreshCatalogs()
      setToast('菜单名称已更新。')
    } catch {
      setToast('重命名菜单失败。')
    }
  }

  const handleDeleteFolder = async (folder: ViewFolderCatalog) => {
    const confirmed = await confirmAction({
      title: `确认删除菜单「${folder.name}」吗？`,
      content: '删除后，该菜单下的主视图会自动迁移到其他菜单（如果存在）。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    try {
      await gridApiClient.deleteViewFolder(folder.id)
      refreshCatalogs()
      setToast('菜单已删除。')
    } catch {
      setToast('删除菜单失败。')
    }
  }

  const handleRenameTable = async (targetTableId: string) => {
    const targetTable = tableItems.find((item) => item.id === targetTableId)
    if (!targetTable) return
    const nextName = await promptForInputText('请输入新的数据表名称', targetTable.name, '数据表名称')
    if (!nextName) return
    setTableActionTableId(targetTableId)
    try {
      await gridApiClient.updateTable(targetTableId, { name: nextName.trim() })
      refreshTables()
      refreshCatalogs()
      setToast('数据表名称已更新。')
    } catch {
      setToast('重命名数据表失败。')
    } finally {
      setTableActionTableId(null)
    }
  }

  const handleDeleteTable = async (targetTableId: string) => {
    const targetTable = tableItems.find((item) => item.id === targetTableId)
    if (!targetTable) return
    const confirmed = await confirmAction({
      title: `确认删除数据表「${targetTable.name}」吗？`,
      content: '删除后，该数据表下的菜单、视图、字段和记录会一起删除。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    const fallbackTable = tableItems.find((item) => item.id !== targetTableId && item.defaultViewId)
    setTableActionTableId(targetTableId)
    try {
      await gridApiClient.deleteTable(targetTableId)
      refreshTables()
      refreshCatalogs()
      setToast('数据表已删除。')
      if (targetTableId === tableId) {
        if (fallbackTable?.defaultViewId) {
          navigate(`/b/${baseId}/t/${fallbackTable.id}/v/${fallbackTable.defaultViewId}/config/views`)
        } else {
          navigate('/')
        }
      }
    } catch {
      setToast('删除数据表失败。')
    } finally {
      setTableActionTableId(null)
    }
  }

  const moveTableInBase = async (targetTableId: string, direction: 'up' | 'down') => {
    const index = tableItems.findIndex((item) => item.id === targetTableId)
    if (index < 0) return
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= tableItems.length) return
    const orderedIds = [...tableItems.map((item) => item.id)]
    ;[orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]]
    setTableActionTableId(targetTableId)
    try {
      await gridApiClient.reorderTables(baseId, orderedIds)
      refreshTables()
      setToast('数据表顺序已更新。')
    } catch {
      setToast('调整数据表顺序失败。')
    } finally {
      setTableActionTableId(null)
    }
  }

  const handleMovePrimaryView = async () => {
    if (isMovingPrimaryView || !movingPrimaryViewId) return
    const targetView = allViews.find((view) => view.id === movingPrimaryViewId)
    if (!targetView) return
    const nextFolderId = movePrimaryTargetFolderId.trim()
    if (!nextFolderId || nextFolderId === (targetView.folderId ?? '')) {
      setMovingPrimaryViewId(null)
      return
    }
    const targetFolder = (catalogsByTableId[targetView.tableId]?.folders ?? []).find((folder) => folder.id === nextFolderId)
    if (!targetFolder) {
      setToast('请选择有效的目标菜单。')
      return
    }
    const confirmed = await confirmAction({
      title: `确认将主视图「${targetView.name}」移动到菜单「${targetFolder.name}」？`,
      content: '其绑定的派生视图会一起跟随到目标菜单。',
      okText: '确认移动',
    })
    if (!confirmed) return
    setIsMovingPrimaryView(true)
    try {
      await gridApiClient.updateView(targetView.id, { folderId: nextFolderId })
      refreshCatalogs()
      setMovingPrimaryViewId(null)
      setToast('主视图已移动到目标菜单。')
    } catch {
      setToast('移动主视图失败。')
    } finally {
      setIsMovingPrimaryView(false)
    }
  }

  const moveFolderInTable = async (targetTableId: string, folderId: string, direction: 'up' | 'down') => {
    const folders = catalogsByTableId[targetTableId]?.folders ?? []
    const index = folders.findIndex((folder) => folder.id === folderId)
    if (index < 0) return
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= folders.length) return
    const nextIds = [...folders.map((folder) => folder.id)]
    ;[nextIds[index], nextIds[nextIndex]] = [nextIds[nextIndex], nextIds[index]]
    try {
      await gridApiClient.reorderViewFolders(targetTableId, nextIds)
      refreshCatalogs()
    } catch {
      setToast('调整菜单顺序失败。')
    }
  }

  const handleCreateView = async () => {
    if (isCreatingView) return
    const name = newViewName.trim()
    if (!name) {
      setToast('请先输入视图名称。')
      return
    }
    if (newViewMode === 'primary' && !newViewTargetFolderId) {
      setToast('请先选择目标菜单。')
      return
    }
    if (newViewMode === 'derived' && !newViewSourceViewId) {
      setToast('请先选择绑定的主视图。')
      return
    }
    const confirmed = await confirmAction({ title: `确认创建视图「${name}」？`, okText: '确认创建' })
    if (!confirmed) return
    setIsCreatingView(true)
    try {
      const targetTableId = newViewTargetTableId || tableId
      const targetFields = fieldsByTableId[targetTableId] ?? []
      const targetType = newViewMode === 'primary' ? 'grid' : newViewType
      const options =
        newViewMode === 'primary'
          ? { folderId: newViewTargetFolderId, viewRole: 'primary' as const }
          : { sourceViewId: newViewSourceViewId, viewRole: 'derived' as const }
      let created = await gridApiClient.createView(targetTableId, name, targetType, options)
      if (targetType === 'grid') {
        created = await gridApiClient.updateView(created.id, {
          config: {
            ...created.config,
            hiddenFieldIds: [],
            compactEmptyRows: true,
          },
        })
      }
      if (targetType === 'form') {
        created = await gridApiClient.updateView(created.id, {
          config: {
            ...created.config,
            formSettings: {
              visibleFieldIds: newFormMode === 'quick' ? targetFields.map((field) => field.id) : [],
              fieldConfig: {},
              cascadeRules: [],
            },
          },
        })
      }
      refreshCatalogs()
      setIsCreateViewOpen(false)
      resetCreateViewDraft()
      if (created.type === 'form') {
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.id}/form-setup`)
      } else if (created.type === 'grid') {
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.id}/config/components?setup=1`)
      } else {
        goToView(created)
      }
    } finally {
      setIsCreatingView(false)
    }
  }

  const closeCreateViewModal = async () => {
    if (isCreatingView) return
    if (!hasCreateViewDraft) {
      setIsCreateViewOpen(false)
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的视图创建信息？',
      content: '关闭后当前视图名称与类型选择将丢失。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    resetCreateViewDraft()
    setIsCreateViewOpen(false)
  }

  const moveViewInGroup = async (targetId: string, groupViews: View[], direction: 'up' | 'down') => {
    const index = groupViews.findIndex((view) => view.id === targetId)
    if (index < 0) return false
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= groupViews.length) return false
    const current = groupViews[index]
    const neighbor = groupViews[nextIndex]
    try {
      await Promise.all([
        gridApiClient.updateView(current.id, { config: { ...current.config, order: neighbor.config.order ?? nextIndex } }),
        gridApiClient.updateView(neighbor.id, { config: { ...neighbor.config, order: current.config.order ?? index } }),
      ])
      refreshCatalogs()
      return true
    } catch {
      setToast('调整视图顺序失败。')
      return false
    }
  }

  const handleDeleteView = async (target: View) => {
    const confirmed = await confirmAction({ title: `确认删除视图「${target.name}」吗？`, okText: '确认删除', danger: true })
    if (!confirmed) return
    const fallbackView = getFallbackViewAfterDelete(target)
    try {
      await gridApiClient.deleteView(target.id)
      if (editingViewId === target.id) setEditingViewId(null)
      refreshCatalogs()
      setToast('视图已删除。')
      if (viewId === target.id && fallbackView) {
        const isConfigViewsRoute = location.pathname.endsWith('/config/views')
        navigate(
          isConfigViewsRoute
            ? `/b/${baseId}/t/${fallbackView.tableId}/v/${fallbackView.id}/config/views`
            : buildViewPath(baseId, fallbackView.tableId, fallbackView),
        )
      }
    } catch {
      setToast('删除视图失败。')
    }
  }

  const handleRenameView = async (target: View) => {
    const nextName = await promptForInputText('请输入新的视图名称', target.name, '视图名称')
    if (!nextName) return
    try {
      await gridApiClient.updateView(target.id, { name: nextName.trim() })
      refreshCatalogs()
      setToast('视图名称已更新。')
    } catch {
      setToast('重命名视图失败。')
    }
  }

  const handleToggleEnabled = async (target: View, enabled: boolean) => {
    const sameTableViews = sortedViewsByTableId[target.tableId] ?? []
    const enabledCount = sameTableViews.filter((view) => view.config.isEnabled !== false).length
    if (!enabled && target.config.isEnabled !== false && enabledCount <= 1) {
      setToast('至少保留一个启用中的视图。')
      return
    }
    try {
      await gridApiClient.updateView(target.id, { config: { ...target.config, isEnabled: enabled } })
      refreshCatalogs()
      setToast(enabled ? '视图已启用。' : '视图已停用。')
      if (viewId === target.id && !enabled) {
        const fallbackView = sameTableViews.find((view) => view.id !== target.id && view.config.isEnabled !== false)
        if (fallbackView) goToView(fallbackView)
      }
    } catch {
      setToast('更新视图启用状态失败。')
    }
  }

  const handlePinViewToTop = async (target: View, groupViews: View[]) => {
    const index = groupViews.findIndex((item) => item.id === target.id)
    if (index <= 0) return
    for (let step = 0; step < index; step += 1) {
      const moved = await moveViewInGroup(target.id, groupViews, 'up')
      if (!moved) break
    }
  }

  const handleImportViewClick = async (targetTableId = tableId, targetFolderId?: string | null) => {
    if (isImportingView) return
    const confirmed = await confirmAction({
      title: '确认导入表格并生成主视图？',
      content: '将选择 Excel 文件并在目标数据表下创建新的主视图。',
      okText: '继续导入',
    })
    if (!confirmed) return
    setImportTargetTableId(targetTableId)
    setImportTargetFolderId(targetFolderId ?? '')
    importInputRef.current?.click()
  }

  const handleImportViewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImportingView(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const result = evt.target?.result
        const wb = XLSX.read(result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]
        if (rows.length === 0) {
          setToast('导入失败：Excel 没有数据行。')
          return
        }
        const headers = Object.keys(rows[0] ?? {}).map((key) => key.trim()).filter(Boolean)
        if (headers.length === 0) {
          setToast('导入失败：未读取到表头。')
          return
        }
        const defaultName = file.name.replace(/\.[^.]+$/, '') || '导入视图'
        const viewName = await promptForInputText('请输入导入后主视图名称', defaultName, '导入视图名称')
        if (!viewName) return
        const records = rows.map((row) => Object.fromEntries(headers.map((header) => [header, row[header] ?? null])))
        const targetTableId = importTargetTableId || tableId
        const created = await gridApiClient.importViewBundle(targetTableId, {
          viewName,
          viewType: 'grid',
          folderId: importTargetFolderId || undefined,
          fields: headers.map((header) => ({ name: header, type: 'text', width: 180 })),
          records,
        })
        refreshCatalogs()
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.viewId}`)
      } catch {
        setToast('导入视图失败，请检查文件格式。')
      } finally {
        setIsImportingView(false)
        setImportTargetFolderId('')
        if (importInputRef.current) importInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      setIsImportingView(false)
      setImportTargetFolderId('')
      setToast('读取导入文件失败。')
      if (importInputRef.current) importInputRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  const handleToggleButtonPermission = (userId: string, key: keyof TableButtonPermissions, checked: boolean) => {
    setButtonPermissionRows((prev) =>
      prev.map((row) =>
        row.userId === userId
          ? {
            ...row,
            buttons: {
              ...row.buttons,
              [key]: checked,
            },
          }
          : row,
      ),
    )
  }

  const resetTableViewButtonsToDefault = async () => {
    if (buttonPermissionRows.length === 0) return
    const confirmed = await confirmAction({
      title: '确认恢复默认按钮权限（全开）？',
      content: '未保存的权限勾选将被重置。',
      okText: '确认恢复',
      danger: true,
    })
    if (!confirmed) return
    setButtonPermissionRows((prev) => prev.map((row) => ({ ...row, buttons: { ...defaultTableButtonPermissions } })))
  }

  const saveTableViewButtons = async () => {
    if (buttonPermissionRows.length === 0 || !editView) return
    const confirmed = await confirmAction({ title: '确认保存当前按钮权限配置？', okText: '确认保存' })
    if (!confirmed) return
    setButtonPermissionSaving(true)
    try {
      const updated = await gridApiClient.updateTableButtonPermissions(
        editView.tableId,
        buttonPermissionRows.map((row) => ({ userId: row.userId, buttons: row.buttons })),
      )
      setButtonPermissionRows(updated)
      setButtonPermissionBaseline(serializeButtonPermissionRows(updated))
      setToast('表格视图按钮权限已保存。')
    } catch {
      setToast('保存表格视图按钮权限失败。')
    } finally {
      setButtonPermissionSaving(false)
    }
  }

  const closeFieldConfigModal = async () => {
    if (buttonPermissionSaving) return
    if (hasButtonPermissionDraft) {
      const confirmed = await confirmAction({
        title: '放弃未保存的视图设置更改？',
        content: '关闭后当前按钮权限草稿将丢失。',
        okText: '放弃并关闭',
        danger: true,
      })
      if (!confirmed) return
    }
    setEditingViewId(null)
  }
  const renderViewActions = (view: View, groupViews: View[], index: number) => {
    const isEnabled = view.config.isEnabled !== false
    const isPrimary = (view.viewRole ?? 'primary') === 'primary'
    const canMoveFolder = isPrimary && (catalogsByTableId[view.tableId]?.folders ?? []).some((folder) => folder.id !== view.folderId)
    return (
      <DropdownMenu
        items={[
          { key: 'viewSettings', label: '视图设置' },
          { key: 'rename', label: '重命名' },
          { key: 'enabled', label: isEnabled ? '停用视图' : '启用视图' },
          ...(isPrimary ? [{ key: 'moveFolder', label: '移动到菜单', disabled: !canMoveFolder }] : []),
          { type: 'divider' },
          { key: 'pinTop', label: '置顶', disabled: index === 0 },
          { key: 'moveUp', label: '上移', disabled: index === 0 },
          { key: 'moveDown', label: '下移', disabled: index === groupViews.length - 1 },
          { type: 'divider' },
          { key: 'delete', label: '删除视图', danger: true },
        ]}
        onClick={({ key }) => {
          if (key === 'viewSettings') return void setEditingViewId(view.id)
          if (key === 'rename') return void handleRenameView(view)
          if (key === 'enabled') return void handleToggleEnabled(view, !isEnabled)
          if (key === 'moveFolder') return void openMovePrimaryViewModal(view)
          if (key === 'pinTop') return void handlePinViewToTop(view, groupViews)
          if (key === 'moveUp') return void moveViewInGroup(view.id, groupViews, 'up')
          if (key === 'moveDown') return void moveViewInGroup(view.id, groupViews, 'down')
          if (key === 'delete') return void handleDeleteView(view)
        }}
      >
        <button className="cm-btn cm-btn--sm">⋮</button>
      </DropdownMenu>
    )
  }

  return (
    <div className="grid-root vm-page">
      <input type="file" ref={importInputRef} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" onChange={handleImportViewFileChange} />

      <div className="vm-header">
        <div className="vm-header-info">
          <h3 className="vm-title">业务配置 / 视图管理</h3>
          <p className="vm-subtitle">
            现在按“菜单/文件夹 -&gt; 主视图 -&gt; 派生视图”维护。左侧菜单对应这里的菜单，顶部切换只显示当前主视图绑定的派生视图。
          </p>
        </div>
        <div className="vm-header-actions">
          <button className="cm-btn" onClick={() => void handleCreateTable()} disabled={isCreatingTable}>
            <PlusOutlined /> 新增数据表
          </button>
          <button className="cm-btn" onClick={() => void handleImportViewClick(tableId)} disabled={isCreatingView || isImportingView}>
            <UploadOutlined /> 导入当前表格
          </button>
          <button className="cm-btn" onClick={() => openCreateFolderModal(tableId)} disabled={isCreatingFolder}>
            <FolderOpenOutlined /> 新增当前表菜单
          </button>
          <button className="cm-btn cm-btn--primary" onClick={() => openCreateViewModal(tableId, { mode: 'primary' })}>
            <PlusOutlined /> 新增当前表主视图
          </button>
        </div>
      </div>

      <div className="vm-table-sections">
        {viewTableSections.map((section, sectionIndex) => (
          <section key={section.tableId} className="vm-table-section">
            <div className="vm-table-section-header">
              <div className="vm-table-section-title">
                <span className="vm-table-section-icon"><AppstoreOutlined /></span>
                <div className="vm-table-section-texts">
                  <strong>{section.tableName}</strong>
                  <span>{section.folders.length} 个菜单 · {section.primaryCount} 个主视图 · {section.derivedCount} 个派生视图 · {section.enabledViews} 个已启用</span>
                </div>
              </div>
              <div className="vm-table-section-actions">
                <button className="cm-btn cm-btn--sm" onClick={() => void handleImportViewClick(section.tableId)} disabled={isImportingView}><UploadOutlined /> 导入</button>
                <button className="cm-btn cm-btn--sm" onClick={() => openCreateFolderModal(section.tableId)} disabled={isCreatingFolder}><FolderOpenOutlined /> 新增菜单</button>
                <button className="cm-btn cm-btn--sm cm-btn--primary" onClick={() => openCreateViewModal(section.tableId, { mode: 'primary' })} disabled={isCreatingView}><PlusOutlined /> 新增主视图</button>
                <DropdownMenu
                  items={[
                    { key: 'rename', label: '重命名数据表' },
                    { key: 'moveUp', label: '上移', disabled: sectionIndex === 0 },
                    { key: 'moveDown', label: '下移', disabled: sectionIndex === viewTableSections.length - 1 },
                    { type: 'divider' },
                    { key: 'delete', label: '删除数据表', danger: true },
                  ]}
                  onClick={({ key }) => {
                    if (key === 'rename') return void handleRenameTable(section.tableId)
                    if (key === 'moveUp') return void moveTableInBase(section.tableId, 'up')
                    if (key === 'moveDown') return void moveTableInBase(section.tableId, 'down')
                    if (key === 'delete') return void handleDeleteTable(section.tableId)
                  }}
                >
                  <button className="cm-btn cm-btn--sm" disabled={tableActionTableId === section.tableId}>⋮</button>
                </DropdownMenu>
              </div>
            </div>

            {section.folders.length === 0 ? (
              <div className="vm-table-empty">{multiTableCatalogLoading || tableCatalogLoading ? '正在加载视图目录...' : '暂无菜单，可先创建菜单后再新增主视图。'}</div>
            ) : (
              <div className="vm-folder-stack">
                {section.folders.map((folder, folderIndex) => (
                  <div key={folder.id} className="vm-folder-card">
                    <div className="vm-folder-header">
                      <div className="vm-folder-info">
                        <span className="vm-folder-icon"><FolderOpenOutlined /></span>
                        <div className="vm-folder-texts">
                          <strong>{folder.name}</strong>
                          <span>{folder.primaryViews.length} 个主视图</span>
                        </div>
                      </div>
                      <div className="vm-folder-actions">
                        <button className="cm-btn cm-btn--sm" onClick={() => void handleImportViewClick(section.tableId, folder.id)} disabled={isImportingView}>
                          <UploadOutlined /> 导入到菜单
                        </button>
                        <button className="cm-btn cm-btn--sm" onClick={() => openCreateViewModal(section.tableId, { mode: 'primary', folderId: folder.id })}><PlusOutlined /> 新增主视图</button>
                        <DropdownMenu
                          items={[
                            { key: 'rename', label: '重命名菜单' },
                            { key: 'moveUp', label: '上移', disabled: folderIndex === 0 },
                            { key: 'moveDown', label: '下移', disabled: folderIndex === section.folders.length - 1 },
                            { type: 'divider' },
                            { key: 'delete', label: '删除菜单', danger: true },
                          ]}
                          onClick={({ key }) => {
                            if (key === 'rename') return void handleRenameFolder(folder)
                            if (key === 'moveUp') return void moveFolderInTable(section.tableId, folder.id, 'up')
                            if (key === 'moveDown') return void moveFolderInTable(section.tableId, folder.id, 'down')
                            if (key === 'delete') return void handleDeleteFolder(folder)
                          }}
                        >
                          <button className="cm-btn cm-btn--sm">⋮</button>
                        </DropdownMenu>
                      </div>
                    </div>

                    {folder.primaryViews.length === 0 ? (
                      <div className="vm-folder-empty">当前菜单下暂无主视图。</div>
                    ) : (
                      <div className="vm-view-grid">
                        {folder.primaryViews.map((entry, primaryIndex) => {
                          const primaryView = entry.view
                          const isPrimaryCurrent = primaryView.id === viewId || entry.derivedViews.some((view) => view.id === viewId)
                          const isPrimaryEnabled = primaryView.config.isEnabled !== false
                          const primaryGroupViews = folder.primaryViews.map((item) => item.view)
                          return (
                            <div key={primaryView.id} className={`vm-view-card ${isPrimaryCurrent ? 'vm-view-card--current' : ''}`}>
                              <div className="vm-card-header">
                                <div className="vm-card-title-row">
                                  <span className="vm-card-icon" aria-hidden="true">{getViewIcon(primaryView)}</span>
                                  <span className="vm-card-name" title={primaryView.name}>{primaryView.name}</span>
                                </div>
                                {isPrimaryCurrent ? <span className="vm-card-badge vm-card-badge--current">当前</span> : null}
                              </div>
                              <div className="vm-card-meta">
                                <span className="vm-card-status"><span className={`vm-card-status-dot ${isPrimaryEnabled ? 'vm-card-status-dot--enabled' : 'vm-card-status-dot--disabled'}`} />{isPrimaryEnabled ? '已启用' : '已停用'}</span>
                                <span className="vm-card-type">{getViewTypeLabel(primaryView)}</span>
                                <span className="vm-card-table-tag">{tableNameById[primaryView.tableId] ?? primaryView.tableId}</span>
                              </div>
                              <div className="vm-card-actions">
                                <button className="cm-btn cm-btn--sm" onClick={() => goToView(primaryView)}>打开</button>
                                <button className="cm-btn cm-btn--sm" onClick={() => navigate(getViewConfigPath(baseId, primaryView))}><SettingOutlined /> 配置</button>
                                <button className="cm-btn cm-btn--sm" onClick={() => openCreateViewModal(section.tableId, { mode: 'derived', sourceViewId: primaryView.id })}><PlusOutlined /> 新增派生</button>
                                {renderViewActions(primaryView, primaryGroupViews, primaryIndex)}
                              </div>

                              <div className="vm-derived-list">
                                <div className="vm-derived-title">派生视图</div>
                                {entry.derivedViews.length === 0 ? (
                                  <div className="vm-derived-empty">暂无派生视图，可创建看板或表单。</div>
                                ) : (
                                  entry.derivedViews.map((derivedView, derivedIndex) => {
                                    const isDerivedCurrent = derivedView.id === viewId
                                    const isDerivedEnabled = derivedView.config.isEnabled !== false
                                    return (
                                      <div key={derivedView.id} className={`vm-derived-row${isDerivedCurrent ? ' vm-derived-row--current' : ''}`}>
                                        <div className="vm-derived-info">
                                          <span className="vm-derived-icon">{getViewIcon(derivedView)}</span>
                                          <div className="vm-derived-texts">
                                            <strong>{derivedView.name}</strong>
                                            <span>{getViewTypeLabel(derivedView)} · {isDerivedEnabled ? '已启用' : '已停用'}</span>
                                          </div>
                                        </div>
                                        <div className="vm-derived-actions">
                                          <button className="cm-btn cm-btn--sm" onClick={() => goToView(derivedView)}>打开</button>
                                          <button className="cm-btn cm-btn--sm" onClick={() => navigate(getViewConfigPath(baseId, derivedView))}><SettingOutlined /></button>
                                          {renderViewActions(derivedView, entry.derivedViews, derivedIndex)}
                                        </div>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <CustomModal open={isCreateFolderOpen} title="新增菜单" onCancel={() => void closeCreateFolderModal()} onOk={() => void handleCreateFolder()} confirmLoading={isCreatingFolder} cancelDisabled={isCreatingFolder} okText="保存" cancelText="取消">
        <div className="form-group">
          <label className="form-label">目标数据表</label>
          <CustomSelect value={newFolderTableId} onChange={(value) => setNewFolderTableId(value ?? tableId)} options={tableItems.map((item) => ({ value: item.id, label: item.name }))} />
        </div>
        <div className="form-group">
          <label className="form-label">菜单名称</label>
          <input className="cm-input" placeholder="输入菜单名称" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleCreateFolder()} autoFocus />
        </div>
      </CustomModal>

      <CustomModal
        open={!!movingPrimaryView}
        title={movingPrimaryView ? `移动主视图 · ${movingPrimaryView.name}` : '移动主视图'}
        onCancel={() => !isMovingPrimaryView && setMovingPrimaryViewId(null)}
        onOk={() => void handleMovePrimaryView()}
        confirmLoading={isMovingPrimaryView}
        cancelDisabled={isMovingPrimaryView}
        okText="确认移动"
        cancelText="取消"
      >
        <div className="form-group">
          <label className="form-label">目标菜单</label>
          <CustomSelect
            value={movePrimaryTargetFolderId}
            onChange={(value) => setMovePrimaryTargetFolderId(value ?? '')}
            options={
              movingPrimaryView
                ? (catalogsByTableId[movingPrimaryView.tableId]?.folders ?? [])
                  .filter((folder) => folder.id !== movingPrimaryView.folderId)
                  .map((folder) => ({ value: folder.id, label: folder.name }))
                : []
            }
          />
        </div>
        <div className="form-group">
          <span className="vm-subtitle">
            派生视图会跟随主视图一起迁移到目标菜单。
          </span>
        </div>
      </CustomModal>

      <CustomModal open={isCreateViewOpen} title={newViewMode === 'primary' ? '新增主视图' : '新增派生视图'} onCancel={() => void closeCreateViewModal()} onOk={() => void handleCreateView()} confirmLoading={isCreatingView} cancelDisabled={isCreatingView} okText="保存" cancelText="取消">
        <div className="form-group">
          <label className="form-label">视图名称</label>
          <input className="cm-input" placeholder="输入视图名称" value={newViewName} onChange={(e) => setNewViewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void handleCreateView()} autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">目标数据表</label>
          <CustomSelect value={newViewTargetTableId} onChange={(value) => setNewViewTargetTableId(value ?? tableId)} options={tableItems.map((item) => ({ value: item.id, label: item.name }))} />
        </div>
        <div className="form-group">
          <label className="form-label">视图层级</label>
          <CustomSelect value={newViewMode} onChange={(value) => setNewViewMode((value ?? 'primary') as ViewCreationMode)} options={[{ value: 'primary', label: '主视图（表格）' }, { value: 'derived', label: '派生视图（绑定主视图）' }]} />
        </div>
        {newViewMode === 'primary' ? (
          <div className="form-group">
            <label className="form-label">目标菜单</label>
            <CustomSelect value={newViewTargetFolderId} onChange={(value) => setNewViewTargetFolderId(value ?? '')} options={(catalogsByTableId[newViewTargetTableId]?.folders ?? []).map((folder) => ({ value: folder.id, label: folder.name }))} />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">绑定主视图</label>
              <CustomSelect value={newViewSourceViewId} onChange={(value) => setNewViewSourceViewId(value ?? '')} options={(catalogsByTableId[newViewTargetTableId]?.folders ?? []).flatMap((folder) => folder.primaryViews.map((entry) => ({ value: entry.view.id, label: `${folder.name} / ${entry.view.name}` })))} />
            </div>
            <div className="form-group">
              <label className="form-label">派生类型</label>
              <CustomSelect value={newViewType} onChange={(value) => setNewViewType((value ?? 'kanban') as 'form' | 'kanban')} options={[{ value: 'kanban', label: '数据看板' }, { value: 'form', label: '表单视图' }]} />
            </div>
            {newViewType === 'form' ? (
              <div className="form-group">
                <label className="form-label">创建方式</label>
                <CustomSelect value={newFormMode} onChange={(value) => setNewFormMode((value ?? 'setup') as 'setup' | 'quick')} options={[{ value: 'setup', label: '空白设计（推荐）' }, { value: 'quick', label: '快速生成（进入表单设计）' }]} />
              </div>
            ) : null}
          </>
        )}
      </CustomModal>

      <CustomModal open={!!editView} title={editView ? `视图设置 · ${editView.name}` : '视图设置'} onCancel={() => void closeFieldConfigModal()} width={960} cancelText="关闭" cancelDisabled={buttonPermissionSaving}>
        {editView ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, background: '#eff6ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ color: '#1e3a8a' }}>字段顺序、表单布局和组件样式请进入对应视图配置页处理。</span>
              <button className="cm-btn cm-btn--primary" onClick={() => navigate(getViewConfigPath(baseId, editView))}>{editView.type === 'form' ? '前往表单设计' : '前往视图配置'}</button>
            </div>
            {editView.type === 'grid' ? (
              <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>表格视图按钮权限</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>仅控制表格视图入口，默认全开。</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="cm-btn cm-btn--sm" onClick={() => void resetTableViewButtonsToDefault()} disabled={buttonPermissionLoading || buttonPermissionRows.length === 0}>恢复全开</button>
                    <button className="cm-btn cm-btn--sm cm-btn--primary" onClick={() => void saveTableViewButtons()} disabled={buttonPermissionLoading || buttonPermissionRows.length === 0 || buttonPermissionSaving}>{buttonPermissionSaving ? '保存中...' : '保存权限'}</button>
                  </div>
                </div>
                {buttonPermissionLoading ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>正在加载按钮权限...</span>
                ) : buttonPermissionRows.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>当前没有可配置的成员权限。</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {buttonPermissionRows.map((row) => (
                      <div key={row.userId} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ minWidth: 120, fontWeight: 500, paddingTop: 2 }}>{row.username}</div>
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
                          {tableButtonPermissionItems.map((item) => (
                            <label key={item.key} className="cm-checkbox-label">
                              <input type="checkbox" className="cm-checkbox" checked={row.buttons[item.key]} onChange={(event) => handleToggleButtonPermission(row.userId, item.key, event.target.checked)} />
                              {item.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CustomModal>
    </div>
  )
}
