import {
  ApiOutlined,
  AppstoreOutlined,
  BankOutlined,
  BgColorsOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  FilterOutlined,
  LogoutOutlined,
  PlusOutlined,
  ProjectOutlined,
  RetweetOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  TableOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import { gridApiClient } from '../features/grid/api'
import type { RecordQueryOptions } from '../features/grid/api/client'
import { CustomModal } from '../features/grid/components/CustomModal'
import { useGridStore, type ImportRecordInput } from '../features/grid/store/gridStore'
import { useAuthStore } from '../features/auth/authStore'
import { useShallow } from 'zustand/react/shallow'
import { FilterModal } from '../features/grid/components/modals/FilterModal'
import { SortModal } from '../features/grid/components/modals/SortModal'
import { CreateRecordModal } from '../features/grid/components/modals/CreateRecordModal'
import type { Field, RecordModel, ReferenceMember } from '../features/grid/types/grid'
import { confirmAction } from '../utils/confirmAction'
import { getApiErrorMessage } from '../utils/apiError'
import { promptForText } from '../utils/promptForText'
import { THEME_STORAGE_KEY, resolveInitialTheme, type ThemeMode } from '../utils/theme'
import { AppShellHeader } from './components/AppShellHeader'
import { AppShellSidebar, type SidebarConfigItem } from './components/AppShellSidebar'
import { AppShellToolbar } from './components/AppShellToolbar'
import { DropdownMenu } from '../features/grid/components/DropdownMenu'
import { ViewTabsBar } from '../features/grid/viewTabs/ViewTabsBar'
import { useAppShellViewCatalog } from './hooks/useAppShellViewCatalog'
import { useAppShellRouteSync } from './hooks/useAppShellRouteSync'
import { useTableCatalog } from './hooks/useTableCatalog'
const configRouteMap: Record<string, string> = {
  'config:views': 'config/views',
  'config:components': 'config/components',
  'config:showcase': 'config/showcase',
  'config:ai-models': 'config/ai-models',
  'config:members': 'config/members',
}
const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024
const EXPORT_FETCH_PAGE_SIZE = 500
const IMPORT_TRUE_LITERALS = new Set(['true', '1', 'yes', 'y', '是', '已选', 'checked'])
const IMPORT_FALSE_LITERALS = new Set(['false', '0', 'no', 'n', '否', '未选', 'unchecked'])

type ExportScope = 'current_page' | 'all_records' | 'current_filters'

const formatExportCellValue = (value: unknown): string | number | boolean => {
  if (value == null) return ''
  if (Array.isArray(value)) {
    return value.map((item) => formatExportCellValue(item)).join(', ')
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
}

const sanitizeFileNameSegment = (value: string) => {
  const normalized = value.replace(/[\\/:*?"<>|]+/g, '_').trim()
  return normalized.length > 0 ? normalized : 'export'
}

const getViewModeIcon = (type: 'grid' | 'form' | 'kanban') => {
  if (type === 'kanban') return <ProjectOutlined />
  if (type === 'form') return <AppstoreOutlined />
  return <TableOutlined />
}

const getViewModeLabel = (type: 'grid' | 'form' | 'kanban') => {
  if (type === 'kanban') return '数据看板'
  if (type === 'form') return '表单视图'
  return '表格视图'
}

const formatDateForImport = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  const hours = value.getHours()
  const minutes = value.getMinutes()
  const seconds = value.getSeconds()
  if (hours === 0 && minutes === 0 && seconds === 0) {
    return `${year}-${month}-${day}`
  }
  return `${year}-${month}-${day}T${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`
}

const splitImportListValue = (value: string) =>
  value
    .split(/[\n,，;；|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

const buildFieldTypeLabel = (type: Field['type']) => {
  switch (type) {
    case 'text':
      return '文本'
    case 'number':
      return '数字'
    case 'date':
      return '日期'
    case 'singleSelect':
      return '单选'
    case 'multiSelect':
      return '多选'
    case 'checkbox':
      return '复选框'
    case 'attachment':
      return '附件'
    case 'image':
      return '图片'
    case 'member':
      return '成员'
    default:
      return type
  }
}

const buildFieldImportInstruction = (field: Field) => {
  switch (field.type) {
    case 'text':
      return '可填写任意文本'
    case 'number':
      return '请填写数字，例如 100 或 88.5'
    case 'date':
      return '请填写日期字符串，例如 2026-03-06 或 2026-03-06T09:30:00'
    case 'singleSelect':
      return '支持填写选项名称或选项ID'
    case 'multiSelect':
      return '多个值用逗号分隔，支持填写选项名称或选项ID'
    case 'checkbox':
      return '支持 true/false、是/否、1/0'
    case 'attachment':
      return '多个文件 URL 用逗号或换行分隔'
    case 'image':
      return '多个图片 URL 用逗号或换行分隔'
    case 'member':
      return '支持填写成员用户名或成员ID'
    default:
      return ''
  }
}

const buildFieldSampleValue = (field: Field, members: ReferenceMember[]) => {
  switch (field.type) {
    case 'text':
      return `${field.name}示例`
    case 'number':
      return 100
    case 'date':
      return '2026-03-06'
    case 'singleSelect':
      return field.options?.[0]?.name ?? field.options?.[0]?.id ?? ''
    case 'multiSelect':
      return (field.options ?? [])
        .slice(0, 2)
        .map((item) => item.name || item.id)
        .join(', ')
    case 'checkbox':
      return true
    case 'attachment':
      return 'https://example.com/files/example.pdf'
    case 'image':
      return 'https://example.com/images/example.png'
    case 'member':
      return members[0]?.username ?? members[0]?.userId ?? ''
    default:
      return ''
  }
}

const buildOptionLookup = (field: Field) => {
  const lookup = new Map<string, string>()
  ;(field.options ?? []).forEach((item) => {
    lookup.set(item.id, item.id)
    lookup.set(item.name, item.id)
  })
  return lookup
}

const buildMemberLookup = (members: ReferenceMember[]) => {
  const lookup = new Map<string, string>()
  members.forEach((item) => {
    lookup.set(item.userId, item.userId)
    lookup.set(item.username, item.userId)
  })
  return lookup
}

const normalizeImportCellValue = (field: Field, rawValue: unknown, members: ReferenceMember[]) => {
  if (rawValue == null) {
    return undefined
  }
  if (typeof rawValue === 'string' && rawValue.trim() === '') {
    return undefined
  }

  switch (field.type) {
    case 'text':
      return typeof rawValue === 'string' ? rawValue : String(rawValue)
    case 'number': {
      if (typeof rawValue === 'number') {
        return rawValue
      }
      const next = Number(String(rawValue).trim())
      if (Number.isNaN(next)) {
        throw new Error(`字段 ${field.name} 需要数字`)
      }
      return next
    }
    case 'date': {
      if (rawValue instanceof Date) {
        return formatDateForImport(rawValue)
      }
      if (typeof rawValue === 'number') {
        const parsed = XLSX.SSF.parse_date_code(rawValue)
        if (!parsed) {
          throw new Error(`字段 ${field.name} 日期格式非法`)
        }
        return formatDateForImport(new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S))
      }
      return String(rawValue).trim()
    }
    case 'singleSelect': {
      const normalized = String(rawValue).trim()
      const optionLookup = buildOptionLookup(field)
      return optionLookup.get(normalized) ?? normalized
    }
    case 'multiSelect': {
      const optionLookup = buildOptionLookup(field)
      const values =
        Array.isArray(rawValue)
          ? rawValue.map((item) => String(item).trim()).filter((item) => item.length > 0)
          : splitImportListValue(String(rawValue))
      return values.map((item) => optionLookup.get(item) ?? item)
    }
    case 'checkbox': {
      if (typeof rawValue === 'boolean') {
        return rawValue
      }
      if (typeof rawValue === 'number') {
        return rawValue !== 0
      }
      const normalized = String(rawValue).trim().toLowerCase()
      if (IMPORT_TRUE_LITERALS.has(normalized)) {
        return true
      }
      if (IMPORT_FALSE_LITERALS.has(normalized)) {
        return false
      }
      throw new Error(`字段 ${field.name} 需要布尔值，可填写 true/false、是/否、1/0`)
    }
    case 'attachment':
    case 'image': {
      if (Array.isArray(rawValue)) {
        return rawValue.map((item) => String(item).trim()).filter((item) => item.length > 0)
      }
      return splitImportListValue(String(rawValue))
    }
    case 'member': {
      const normalized = String(rawValue).trim()
      const memberLookup = buildMemberLookup(members)
      return memberLookup.get(normalized) ?? normalized
    }
    default:
      return rawValue
  }
}

const withMenuIcon = (icon: ReactNode, text: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }}>{icon}</span>
    <span>{text}</span>
  </span>
)

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { baseId = 'base_1', tableId = '', viewId = '' } = useParams()
  const { tables: tableItems, isLoading: tableCatalogLoading, refreshTables } = useTableCatalog(baseId)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => resolveInitialTheme())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarGroupsOpen, setSidebarGroupsOpen] = useState({
    views: true,
    configs: true,
    systems: true,
  })
  const [viewportWidth, setViewportWidth] = useState<number>(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  const {
    fields,
    pageRecordCount,
    totalRecords,
    views,
    selectedRecordIds,
    isAllRecordsSelected,
    toast,
    createRecord,
    deleteSelectedRecords,
    clearSelectedRecords,
    selectAllRecords,
    createView,
    updateViewConfig,
    importRecords,
    viewConfig,
    tableButtonPermissions,
    cascadeRules,
    tableReferenceMembers,
  } = useGridStore(
    useShallow((state) => ({
      fields: state.fields,
      pageRecordCount: state.records.length,
      totalRecords: state.totalRecords,
      views: state.views,
      selectedRecordIds: state.selectedRecordIds,
      isAllRecordsSelected: state.isAllRecordsSelected,
      toast: state.toast,
      createRecord: state.createRecord,
      deleteSelectedRecords: state.deleteSelectedRecords,
      clearSelectedRecords: state.clearSelectedRecords,
      selectAllRecords: state.selectAllRecords,
      createView: state.createView,
      updateViewConfig: state.updateViewConfig,
      importRecords: state.importRecords,
      viewConfig: state.viewConfig,
      tableButtonPermissions: state.tableButtonPermissions,
      cascadeRules: state.cascadeRules,
      tableReferenceMembers: state.tableReferenceMembers,
    })),
  )
  const setToast = useGridStore((state) => state.setToast)
  const {
    user,
    currentTenant,
    // 暂停租户切换功能
    // tenants,
    // switchTenant,
    logout,
    role,
    roleKey,
  } = useAuthStore(
    useShallow((state) => ({
      user: state.user,
      currentTenant: state.currentTenant,
      // 暂停租户切换功能
      // tenants: state.tenants,
      // switchTenant: state.switchTenant,
      logout: state.logout,
      role: state.role,
      roleKey: state.roleKey,
    })),
  )
  const isDarkMode = themeMode === 'dark'
  const [isCreatingTable, setIsCreatingTable] = useState(false)
  const [pendingCreatedTableId, setPendingCreatedTableId] = useState<string | null>(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleResize = () => setViewportWidth(window.innerWidth)
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeoutId = window.setTimeout(() => {
      setToast(null)
    }, 2400)
    return () => window.clearTimeout(timeoutId)
  }, [setToast, toast])

  const toggleThemeMode = useCallback(() => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => !current)
  }, [])
  const toggleSidebarGroup = useCallback((key: 'views' | 'configs' | 'systems') => {
    setSidebarGroupsOpen((current) => ({ ...current, [key]: !current[key] }))
  }, [])

  const isViewManageRoute = location.pathname.includes('/config/views')
  const isComponentsRoute = location.pathname.includes('/config/components')
  const isShowcaseRoute = location.pathname.includes('/config/showcase')
  const isMembersRoute = location.pathname.includes('/config/members')
  const isAiModelsRoute = location.pathname.includes('/config/ai-models')
  const isFormSetupRoute = location.pathname.includes('/form-setup')
  const isFormRoute = location.pathname.endsWith('/form')
  const isKanbanRoute = location.pathname.endsWith('/kanban')
  const isConfigLikeRoute =
    isViewManageRoute ||
    isComponentsRoute ||
    isShowcaseRoute ||
    isMembersRoute ||
    isAiModelsRoute ||
    isFormSetupRoute
  const showViewTabs = !isConfigLikeRoute && !isFormRoute
  const showGridToolbar = !isConfigLikeRoute && !isFormRoute && !isKanbanRoute
  const canViewBusinessConfig = role === 'owner' || roleKey === 'admin'
  const { tableNameMap, visibleViews, allVisibleViews, sidebarFolders, activeFolder, activePrimaryView, activeModeViews } = useAppShellViewCatalog({
    tableItems,
    tableId,
    viewId,
    views,
  })

  useEffect(() => {
    if (tableCatalogLoading) return
    if (pendingCreatedTableId && pendingCreatedTableId === tableId && !tableItems.some((item) => item.id === pendingCreatedTableId)) {
      return
    }
    if (tableItems.length === 0) return
    if (tableItems.some((item) => item.id === tableId)) return
    const fallbackView = allVisibleViews[0]
    if (fallbackView) {
      navigate(`/b/${baseId}/t/${fallbackView.tableId}/v/${fallbackView.id}`, { replace: true })
      return
    }
    const fallbackTable = tableItems.find((item) => item.defaultViewId) ?? tableItems[0]
    if (fallbackTable?.defaultViewId) {
      navigate(`/b/${baseId}/t/${fallbackTable.id}/v/${fallbackTable.defaultViewId}`, { replace: true })
    }
  }, [allVisibleViews, baseId, navigate, pendingCreatedTableId, tableCatalogLoading, tableId, tableItems])

  useEffect(() => {
    if (!pendingCreatedTableId) return
    if (!tableItems.some((item) => item.id === pendingCreatedTableId)) return
    setPendingCreatedTableId(null)
  }, [pendingCreatedTableId, tableItems])

  const { openSidebarView } = useAppShellRouteSync({
    baseId,
    tableId,
    viewId,
    pathname: location.pathname,
    search: location.search,
    views,
    visibleViews,
    navigate,
    updateViewConfig,
    canViewBusinessConfig,
    isViewManageRoute,
    isComponentsRoute,
    isShowcaseRoute,
    isMembersRoute,
    isAiModelsRoute,
  })

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [isCreateRecordOpen, setIsCreateRecordOpen] = useState(false)
  const [viewTabsReloadToken, setViewTabsReloadToken] = useState(0)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null)
  const [importDialogError, setImportDialogError] = useState<string | null>(null)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [exportScope, setExportScope] = useState<ExportScope>('current_page')
  const [fieldDisplayOpen, setFieldDisplayOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const fieldDisplayRef = useRef<HTMLDivElement>(null)
  const sortedPresets = useMemo(() => {
    const presets = viewConfig.filterPresets ?? []
    return [...presets].sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
  }, [viewConfig.filterPresets])

  const canCreateRecord = tableButtonPermissions.canCreateRecord
  const canDeleteRecord = tableButtonPermissions.canDeleteRecord
  const canImportRecords = tableButtonPermissions.canImportRecords
  const canExportRecords = tableButtonPermissions.canExportRecords
  const canManageFilters = tableButtonPermissions.canManageFilters
  const canManageSorts = tableButtonPermissions.canManageSorts
  const hasSelectedRecords = selectedRecordIds.length > 0 || isAllRecordsSelected
  const hasFilterSummary = viewConfig.filters.length > 0
  const hasSortSummary = viewConfig.sorts.length > 0
  const canDeleteSelectionNow = canDeleteRecord && hasSelectedRecords
  const deleteButtonLabel = isAllRecordsSelected ? `删除本页（${pageRecordCount}）` : `删除已选（${selectedRecordIds.length}）`
  const handleCreateTable = useCallback(async () => {
    if (isCreatingTable || !canViewBusinessConfig) return
    const name = await promptForText('请输入数据表名称', '', '数据表名称')
    if (!name) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setToast('请先输入数据表名称。')
      return
    }
    setIsCreatingTable(true)
    try {
      const created = await gridApiClient.createTable(baseId, trimmedName)
      if (!created.defaultViewId) {
        throw new Error('新数据表未生成默认视图')
      }
      setPendingCreatedTableId(created.id)
      refreshTables()
      navigate(`/b/${baseId}/t/${created.id}/v/${created.defaultViewId}`)
      setToast(`数据表「${created.name}」已创建。`)
    } catch (error) {
      setToast(getApiErrorMessage(error, '创建数据表失败。'))
    } finally {
      setIsCreatingTable(false)
    }
  }, [baseId, canViewBusinessConfig, isCreatingTable, navigate, refreshTables, setToast])
  const orderedFields = useMemo(() => {
    const fieldOrderIds = viewConfig.fieldOrderIds ?? fields.map((field) => field.id)
    const indexMap = new Map(fieldOrderIds.map((id, index) => [id, index]))
    return [...fields].sort((a, b) => {
      const ai = indexMap.get(a.id)
      const bi = indexMap.get(b.id)
      const ao = ai === undefined ? Number.MAX_SAFE_INTEGER : ai
      const bo = bi === undefined ? Number.MAX_SAFE_INTEGER : bi
      return ao - bo
    })
  }, [fields, viewConfig.fieldOrderIds])
  const hiddenFieldSet = useMemo(() => new Set(viewConfig.hiddenFieldIds ?? []), [viewConfig.hiddenFieldIds])
  const visibleFieldsForExport = useMemo(
    () => orderedFields.filter((field) => !hiddenFieldSet.has(field.id)),
    [hiddenFieldSet, orderedFields],
  )
  const visibleFieldCount = useMemo(
    () => orderedFields.filter((field) => !hiddenFieldSet.has(field.id)).length,
    [hiddenFieldSet, orderedFields],
  )
  const toolbarCollapseToMore = viewportWidth < 1380
  const toolbarUltraCompact = viewportWidth < 1220
  const activeView = useMemo(
    () => activeModeViews.find((view) => view.id === viewId) ?? visibleViews.find((view) => view.id === viewId) ?? activePrimaryView ?? null,
    [activeModeViews, activePrimaryView, viewId, visibleViews],
  )
  const configRouteAnchorView = useMemo(
    () =>
      allVisibleViews.find((view) => view.id === viewId && view.tableId === tableId) ??
      visibleViews.find((view) => view.id === viewId) ??
      visibleViews[0] ??
      allVisibleViews[0] ??
      views.find((view) => view.id === viewId && view.tableId === tableId) ??
      views[0] ??
      null,
    [allVisibleViews, tableId, viewId, views, visibleViews],
  )

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    const preset = (viewConfig.filterPresets ?? []).find((item) => item.id === presetId)
    if (!preset) {
      return
    }
    updateViewConfig({
      filters: preset.filters,
      sorts: preset.sorts,
      filterLogic: preset.filterLogic,
    })
  }

  const toggleFieldVisibility = (fieldId: string, visible: boolean) => {
    const hidden = new Set(viewConfig.hiddenFieldIds ?? [])
    if (visible) {
      hidden.delete(fieldId)
    } else {
      if (visibleFieldCount <= 1 && !hidden.has(fieldId)) {
        setToast('至少保留一个字段可见。', 'warning')
        return
      }
      hidden.add(fieldId)
    }
    const nextHidden = orderedFields.filter((field) => hidden.has(field.id)).map((field) => field.id)
    updateViewConfig({ hiddenFieldIds: nextHidden })
  }

  const handleExport = async () => {
    if (isExporting) return
    setExportScope(viewConfig.filters.length > 0 || viewConfig.sorts.length > 0 ? 'current_filters' : 'current_page')
    setIsExportModalOpen(true)
  }

  const handleImportClick = async () => {
    if (isImporting) return
    setImportDialogError(null)
    setSelectedImportFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setIsImportModalOpen(true)
  }

  const handleDeleteSelection = async () => {
    const currentRecords = useGridStore.getState().records
    const targetIds = isAllRecordsSelected ? currentRecords.map((item) => item.id) : selectedRecordIds
    const sample = targetIds.slice(0, 3).join(', ')
    const suffix = targetIds.length > 3 ? ' ...' : ''
    const confirmed = await confirmAction({
      title: isAllRecordsSelected ? '确认删除本页数据？' : '确认删除本页已勾选数据？',
      content: `将删除本页 ${targetIds.length} 条记录。样本ID: ${sample}${suffix}`,
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    await deleteSelectedRecords()
  }

  const handleClearFilters = async () => {
    if (viewConfig.filters.length === 0 && viewConfig.sorts.length === 0) return
    const confirmed = await confirmAction({
      title: '确认清空当前筛选/排序条件？',
      content: '清空后将展示当前视图全部记录，并恢复默认排序。',
      okText: '确认清空',
      danger: true,
    })
    if (!confirmed) return
    updateViewConfig({ filters: [], sorts: [], filterLogic: 'and' })
    setSelectedPresetId('')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const lowerFileName = file.name.toLowerCase()
    if (!lowerFileName.endsWith('.xlsx') && !lowerFileName.endsWith('.xls') && !lowerFileName.endsWith('.csv')) {
      setImportDialogError('仅支持导入 .xlsx、.xls 或 .csv 文件。')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setImportDialogError(`导入文件不能超过 ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024)}MB。`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setSelectedImportFile(file)
    setImportDialogError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCloseImportModal = () => {
    if (isImporting) return
    setIsImportModalOpen(false)
    setSelectedImportFile(null)
    setImportDialogError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCloseExportModal = () => {
    if (isExporting) return
    setIsExportModalOpen(false)
  }

  const handleSelectImportFile = () => {
    if (isImporting) return
    fileInputRef.current?.click()
  }

  const parseImportFile = useCallback(
    (file: File) =>
      new Promise<ImportRecordInput[]>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (evt) => {
          try {
            const binary = evt.target?.result
            if (typeof binary !== 'string') {
              throw new Error('读取导入文件失败。')
            }
            const workbook = XLSX.read(binary, { type: 'binary', cellDates: true })
            const sheetName = workbook.SheetNames[0]
            if (!sheetName) {
              throw new Error('导入文件为空或未找到可读取的工作表。')
            }
            const worksheet = workbook.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })
            if (!Array.isArray(rows) || rows.length === 0) {
              throw new Error('导入文件没有可导入的数据行。')
            }
            const formSettings = viewConfig.formSettings || {}
            const fieldAliasMap = new Map<string, string>()
            fields.forEach((field) => {
              fieldAliasMap.set(field.id.trim(), field.id)
              fieldAliasMap.set(field.name.trim(), field.id)
              const customLabel = formSettings.fieldConfig?.[field.id]?.label?.trim()
              if (customLabel) {
                fieldAliasMap.set(customLabel, field.id)
              }
            })
            const mappedRows = rows.map((row, index) => {
              const values: Record<string, unknown> = {}
              Object.entries(row).forEach(([key, cellValue]) => {
                const fieldId = fieldAliasMap.get(key.trim())
                if (fieldId) {
                  const field = fields.find((item) => item.id === fieldId)
                  if (!field) {
                    return
                  }
                  try {
                    const normalized = normalizeImportCellValue(field, cellValue, tableReferenceMembers)
                    if (normalized !== undefined) {
                      values[fieldId] = normalized
                    }
                  } catch (error) {
                    throw new Error(`第 ${index + 2} 行：${getApiErrorMessage(error, `字段 ${field.name} 值格式错误`)}`)
                  }
                }
              })
              return {
                rowNumber: index + 2,
                values,
              }
            })
            const validRows = mappedRows.filter((row) => Object.keys(row.values).length > 0)
            if (validRows.length === 0) {
              throw new Error('未匹配到可导入字段，请检查表头是否使用字段 ID、字段名或自定义显示名。')
            }
            resolve(validRows)
          } catch (error) {
            reject(error)
          }
        }
        reader.onerror = () => reject(new Error('读取导入文件失败。'))
        reader.readAsBinaryString(file)
      }),
    [fields, tableReferenceMembers, viewConfig.formSettings],
  )

  const handleDownloadImportTemplate = useCallback(() => {
    const formSettings = viewConfig.formSettings || {}
    const headers = orderedFields.map((field) => formSettings.fieldConfig?.[field.id]?.label || field.name)
    const exampleRow = Object.fromEntries(
      orderedFields.map((field) => [
        formSettings.fieldConfig?.[field.id]?.label || field.name,
        buildFieldSampleValue(field, tableReferenceMembers),
      ]),
    )
    const instructionRows = orderedFields.map((field) => ({
      列名: formSettings.fieldConfig?.[field.id]?.label || field.name,
      字段ID: field.id,
      字段类型: buildFieldTypeLabel(field.type),
      示例值: buildFieldSampleValue(field, tableReferenceMembers),
      填写说明: buildFieldImportInstruction(field),
    }))
    const templateSheet = XLSX.utils.json_to_sheet([exampleRow], {
      header: headers,
      skipHeader: false,
    })
    const instructionSheet = XLSX.utils.json_to_sheet(instructionRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, templateSheet, '导入模板')
    XLSX.utils.book_append_sheet(workbook, instructionSheet, '填写说明')
    const fileBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const tableName = sanitizeFileNameSegment(tableNameMap.get(tableId)?.name ?? tableId)
    saveAs(blob, `${tableName}_import_template.xlsx`)
  }, [orderedFields, tableId, tableNameMap, tableReferenceMembers, viewConfig.formSettings])

  const fetchRecordsForExport = useCallback(
    async (query?: RecordQueryOptions) => {
      const items: RecordModel[] = []
      let cursor: string | undefined
      let totalCount = 0
      while (true) {
        const page = await gridApiClient.getRecords(tableId, viewId, cursor, EXPORT_FETCH_PAGE_SIZE, query)
        items.push(...page.items)
        totalCount = page.totalCount
        if (!page.nextCursor) {
          break
        }
        cursor = page.nextCursor
        setToast(`正在准备导出：${items.length} / ${page.totalCount}`, 'info')
      }
      return { items, totalCount }
    },
    [setToast, tableId, viewId],
  )

  const handleConfirmImport = async () => {
    if (isImporting) return
    if (!selectedImportFile) {
      setImportDialogError('请先选择需要导入的 Excel 或 CSV 文件。')
      return
    }
    setIsImporting(true)
    setImportDialogError(null)
    try {
      const mappedData = await parseImportFile(selectedImportFile)
      await importRecords(tableId, mappedData)
      setIsImportModalOpen(false)
      setSelectedImportFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      setImportDialogError(getApiErrorMessage(error, '导入失败，请检查文件格式。'))
    } finally {
      setIsImporting(false)
    }
  }

  const handleConfirmExport = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const currentViewQuery: RecordQueryOptions = {
        filters: viewConfig.filters,
        sorts: viewConfig.sorts,
        filterLogic: viewConfig.filterLogic ?? 'and',
      }
      let recordsToExport = useGridStore.getState().records
      let exportCount = recordsToExport.length
      if (exportScope === 'all_records') {
        setToast('正在准备全部数据导出，请稍候。', 'info')
        const result = await fetchRecordsForExport()
        recordsToExport = result.items
        exportCount = result.totalCount
      } else if (exportScope === 'current_filters') {
        setToast('正在准备筛选结果导出，请稍候。', 'info')
        const result = await fetchRecordsForExport(currentViewQuery)
        recordsToExport = result.items
        exportCount = result.totalCount
      }
      if (recordsToExport.length === 0) {
        setToast('当前没有可导出的记录。', 'warning')
        return
      }
      const formSettings = viewConfig.formSettings || {}
      const fieldsToExport = visibleFieldsForExport.length > 0 ? visibleFieldsForExport : orderedFields
      const data = recordsToExport.map((record) => {
        const row: Record<string, unknown> = { ID: record.id }
        fieldsToExport.forEach((field) => {
          const label = formSettings.fieldConfig?.[field.id]?.label || field.name
          row[label] = formatExportCellValue(record.values[field.id])
        })
        return row
      })
      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Records')
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const tableName = sanitizeFileNameSegment(tableNameMap.get(tableId)?.name ?? tableId)
      const scopeName =
        exportScope === 'all_records' ? 'all-records' : exportScope === 'current_filters' ? 'filtered-records' : 'current-page'
      saveAs(blob, `${tableName}_${scopeName}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      setToast(`已导出 ${exportCount} 条记录。`, 'success')
      setIsExportModalOpen(false)
    } catch (error) {
      setToast(getApiErrorMessage(error, '导出失败，请稍后重试。'), 'error')
    } finally {
      window.setTimeout(() => setIsExporting(false), 180)
    }
  }

  const openConfigRoute = useCallback(
    (key: string) => {
      if (key === 'config:ai-models') {
        setToast('模型配置功能待开发，敬请期待。', 'info')
        return
      }
      const suffix = configRouteMap[key]
      if (!suffix) return
      const anchor = configRouteAnchorView
      if (!anchor) {
        setToast('暂无可用视图，暂时无法打开配置页。', 'warning')
        return
      }
      navigate(`/b/${baseId}/t/${anchor.tableId}/v/${anchor.id}/${suffix}`)
    },
    [baseId, configRouteAnchorView, navigate, setToast],
  )
  const openComingSoon = useCallback(
    (featureName: string) => {
      setToast(`${featureName}功能待开发，敬请期待。`, 'info')
    },
    [setToast],
  )
  const createViewFromAddMenu = useCallback(
    async (type: 'grid' | 'kanban' | 'form') => {
      const labelMap = {
        grid: '表格主视图',
        kanban: '数据看板',
        form: '表单视图',
      } as const
      const defaultNameMap = {
        grid: '新建表格视图',
        kanban: '新建看板',
        form: '新建表单',
      } as const
      if (type !== 'grid' && !activePrimaryView) {
        setToast('请先选择一个表格主视图，再创建对应的派生视图。', 'warning')
        return
      }
      const name = await promptForText(`新增${labelMap[type]}`, defaultNameMap[type], '请输入视图名称')
      const nextName = name?.trim()
      if (!nextName) return
      const created = await createView(
        tableId,
        nextName,
        type,
        undefined,
        type === 'grid'
          ? {
              folderId: activeFolder?.id ?? null,
              viewRole: 'primary',
            }
          : {
              sourceViewId: activePrimaryView?.id ?? null,
              viewRole: 'derived',
            },
      )
      if (!created) return
      openSidebarView(created)
    },
    [activeFolder?.id, activePrimaryView, createView, openSidebarView, setToast, tableId],
  )
  const addMenuItems = useMemo(
    () => [
      { key: 'add:view:grid', label: '新增表格主视图' },
      { key: 'add:view:kanban', label: '新增数据看板' },
      { key: 'add:view:gantt', label: '新增甘特图（即将上线）' },
      { key: 'add:view:calendar', label: '新增日历视图（即将上线）' },
      { key: 'add:view:form', label: '新增表单视图' },
      { key: 'add:view:task', label: '新增任务视图（即将上线）' },
    ],
    [],
  )
  const handleAddMenuAction = useCallback(
    async (key: string) => {
      if (key === 'add:view:grid') {
        await createViewFromAddMenu('grid')
        return
      }
      if (key === 'add:view:kanban') {
        await createViewFromAddMenu('kanban')
        return
      }
      if (key === 'add:view:form') {
        await createViewFromAddMenu('form')
        return
      }
      if (key === 'add:view:gantt') {
        openComingSoon('甘特图')
        return
      }
      if (key === 'add:view:calendar') {
        openComingSoon('日历视图')
        return
      }
      if (key === 'add:view:task') {
        openComingSoon('任务视图')
      }
    },
    [createViewFromAddMenu, openComingSoon],
  )
  // 暂停租户切换功能
  // const handleTenantSwitch = useCallback(
  //   async (nextTenantId: string) => {
  //     await switchTenant(nextTenantId)
  //     navigate('/b/base_1/t/tbl_1/v/viw_1')
  //   },
  //   [navigate, switchTenant],
  // )

  // Close field display panel on outside click
  useEffect(() => {
    if (!fieldDisplayOpen) return
    const handleClick = (e: MouseEvent) => {
      if (fieldDisplayRef.current && !fieldDisplayRef.current.contains(e.target as Node)) {
        setFieldDisplayOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [fieldDisplayOpen])

  // User menu dropdown items
  const userMenuItems = [
    { key: 'tenant:current', label: withMenuIcon(<BankOutlined />, `当前租户：${currentTenant?.name ?? '工作区'}`), disabled: true },
    { key: 'tenant:switch', label: withMenuIcon(<RetweetOutlined />, '切换租户（待开发）') },
    { type: 'divider' as const },
    // 暂停租户切换菜单
    // ...(tenants.length > 1
    //   ? tenants.map((item) => ({
    //     key: `tenant:${item.id}`,
    //     label: `${item.name}${item.id === currentTenant?.id ? '（当前）' : ''}`,
    //   }))
    //   : []),
    { key: 'logout', label: withMenuIcon(<LogoutOutlined />, '退出登录'), danger: true },
  ]
  const handleUserMenuSelect = useCallback(
    (key: string) => {
      if (key === 'tenant:switch') {
        openComingSoon('租户切换')
        return
      }
      if (key === 'logout') {
        void logout()
        return
      }
      // 暂停租户切换菜单行为
      // if (String(key).startsWith('tenant:')) {
      //   void handleTenantSwitch(String(key).replace('tenant:', ''))
      // }
    },
    [logout, openComingSoon],
  )

  // Toolbar overflow menu items
  const toolbarOverflowMenuItems = [
    ...(toolbarUltraCompact && canManageFilters
      ? [{ key: 'more:filter', label: withMenuIcon(<FilterOutlined />, `筛选${viewConfig.filters.length > 0 ? `（${viewConfig.filters.length}）` : ''}`) }]
      : []),
    ...(toolbarUltraCompact && canManageSorts
      ? [{ key: 'more:sort', label: withMenuIcon(<SortAscendingOutlined />, `排序${viewConfig.sorts.length > 0 ? `（${viewConfig.sorts.length}）` : ''}`) }]
      : []),
    ...(toolbarCollapseToMore && (canManageFilters || canManageSorts) && (viewConfig.filters.length > 0 || viewConfig.sorts.length > 0)
      ? [{ key: 'more:clearFilters', label: withMenuIcon(<CloseCircleOutlined />, '清空筛选/排序') }]
      : []),
    ...(toolbarCollapseToMore && canExportRecords ? [{ key: 'more:export', label: withMenuIcon(<DownloadOutlined />, '导出') }] : []),
    ...(toolbarCollapseToMore && canImportRecords ? [{ key: 'more:import', label: withMenuIcon(<UploadOutlined />, '导入') }] : []),
  ]

  const handleToolbarOverflow = (key: string) => {
    if (key === 'more:filter') setIsFilterOpen(true)
    else if (key === 'more:sort') setIsSortOpen(true)
    else if (key === 'more:clearFilters') void handleClearFilters()
    else if (key === 'more:export') void handleExport()
    else if (key === 'more:import') void handleImportClick()
  }

  // config menu items list
  const dataViewConfigItems: SidebarConfigItem[] = canViewBusinessConfig
    ? [
      { key: 'config:views', icon: <SettingOutlined />, label: '视图配置', status: 'enabled' },
      { key: 'config:components', icon: <AppstoreOutlined />, label: '视图组件配置', status: 'enabled' },
      { key: 'config:showcase', icon: <BgColorsOutlined />, label: '组件参考', status: 'enabled' },
    ]
    : []
  const systemConfigItems: SidebarConfigItem[] = canViewBusinessConfig
    ? [
      { key: 'config:ai-models', icon: <ApiOutlined />, label: '模型配置', status: 'soon' },
      ...(role === 'owner' ? [{ key: 'config:members', icon: <TeamOutlined />, label: '成员管理', status: 'enabled' as const }] : []),
    ]
    : []

  const activeConfigKey = isViewManageRoute
    ? 'config:views'
    : isComponentsRoute
      ? 'config:components'
    : isShowcaseRoute
        ? 'config:showcase'
        : isAiModelsRoute
          ? 'config:ai-models'
          : isMembersRoute
            ? 'config:members'
            : ''

  return (
    <div className="app-shell">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
      />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}>
        {/* Header */}
        <AppShellHeader
          currentTenantName={currentTenant?.name}
          isDarkMode={isDarkMode}
          onToggleThemeMode={toggleThemeMode}
          userMenuItems={userMenuItems}
          onUserMenuSelect={handleUserMenuSelect}
          username={user?.username}
        />

        {/* Body: sidebar + content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <AppShellSidebar
            sidebarCollapsed={sidebarCollapsed}
            sidebarGroupsOpen={sidebarGroupsOpen}
            onToggleSidebarCollapsed={toggleSidebarCollapsed}
            onToggleSidebarGroup={toggleSidebarGroup}
            onOpenHome={() => openComingSoon('首页')}
            canCreateTable={canViewBusinessConfig}
            isCreatingTable={isCreatingTable}
            onCreateTable={() => void handleCreateTable()}
            sidebarFolders={sidebarFolders}
            activePrimaryViewId={activePrimaryView?.id ?? ''}
            activeFolderId={activeFolder?.id ?? null}
            onOpenSidebarView={openSidebarView}
            dataViewConfigItems={dataViewConfigItems}
            systemConfigItems={systemConfigItems}
            activeConfigKey={activeConfigKey}
            onOpenConfigRoute={openConfigRoute}
          />

          {/* Main content */}
          <main style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex' }}>
            <div
              className={`main-panel${!isConfigLikeRoute && !isFormRoute ? ' main-panel--grid' : ''}`}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                height: '100%',
                padding: isConfigLikeRoute ? 16 : 20,
                overflowY: isConfigLikeRoute ? 'auto' : 'hidden',
                overflowX: 'hidden',
              }}
            >
              {!isConfigLikeRoute && !isFormRoute ? (
                <>
                  {/* Page header — outside the card */}
                  <div className="grid-page-header">
                    <div className="grid-page-header-left">
                      <h1 className="grid-page-title">{activeFolder?.name ?? tableNameMap.get(tableId)?.name ?? '数据表'}</h1>
                    </div>
                    <div className="grid-page-header-right">
                      {!toolbarCollapseToMore && canImportRecords ? (
                        <button className="cm-btn" onClick={() => void handleImportClick()} disabled={isExporting || isImporting}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <UploadOutlined />
                            <span>{isImporting ? '导入中...' : '导入'}</span>
                          </span>
                        </button>
                      ) : null}
                      {!toolbarCollapseToMore && canExportRecords ? (
                        <button className="cm-btn" onClick={() => void handleExport()} disabled={isImporting || isExporting}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <DownloadOutlined />
                            <span>{isExporting ? '导出中...' : '导出'}</span>
                          </span>
                        </button>
                      ) : null}
                      {canCreateRecord ? (
                        <button className="cm-btn cm-btn--primary" onClick={() => setIsCreateRecordOpen(true)}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <PlusOutlined />
                            <span>新增记录</span>
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* View mode tabs — between header and card */}
                  <div className="view-mode-tabs-row">
                    {activeModeViews.map((view) => {
                      const isActive = view.id === (activeView?.id ?? viewId)
                      return (
                        <button
                          key={view.id}
                          className={`view-mode-tab-item${isActive ? ' is-active' : ''}`}
                          onClick={() => openSidebarView(view)}
                        >
                          <span className="view-mode-tab-icon">{getViewModeIcon(view.type)}</span>
                          <span>{view.name || getViewModeLabel(view.type)}</span>
                        </button>
                      )
                    })}
                    <DropdownMenu items={addMenuItems} onSelect={(key) => void handleAddMenuAction(key)}>
                      <button className="view-mode-tab-add">
                        <PlusOutlined />
                        <span>新增视图</span>
                      </button>
                    </DropdownMenu>
                  </div>

                  {/* Main card — tabs + toolbar + table + pagination */}
                  <div className="grid-page-card">
                    {showViewTabs ? (
                      <ViewTabsBar
                        viewId={viewId}
                        tableId={tableId}
                        reloadToken={viewTabsReloadToken}
                        current={{
                          filterLogic: viewConfig.filterLogic ?? 'and',
                          filters: viewConfig.filters,
                          sorts: viewConfig.sorts,
                        }}
                        onApply={(payload) =>
                          updateViewConfig({
                            filterLogic: payload.filterLogic,
                            filters: payload.filters,
                            sorts: payload.sorts,
                          })
                        }
                        onToast={setToast}
                        toolbarSlot={
                          showGridToolbar ? (
                            <AppShellToolbar
                              showGridToolbar={showGridToolbar}
                              canManageFilters={canManageFilters}
                              canManageSorts={canManageSorts}
                              canCreateRecord={false}
                              canDeleteSelectionNow={canDeleteSelectionNow}
                              canExportRecords={false}
                              canImportRecords={false}
                              viewConfig={viewConfig}
                              onOpenFilter={() => setIsFilterOpen(true)}
                              onOpenSort={() => setIsSortOpen(true)}
                              fieldDisplayRef={fieldDisplayRef}
                              fieldDisplayOpen={fieldDisplayOpen}
                              onToggleFieldDisplayOpen={() => setFieldDisplayOpen((v) => !v)}
                              visibleFieldCount={visibleFieldCount}
                              orderedFields={orderedFields}
                              hiddenFieldSet={hiddenFieldSet}
                              onToggleFieldVisibility={toggleFieldVisibility}
                              onShowAllFields={() => updateViewConfig({ hiddenFieldIds: [] })}
                              onOpenCreateRecord={() => setIsCreateRecordOpen(true)}
                              onDeleteSelection={handleDeleteSelection}
                              deleteButtonLabel={deleteButtonLabel}
                              toolbarCollapseToMore={toolbarCollapseToMore}
                              isImporting={isImporting}
                              isExporting={isExporting}
                              onExport={handleExport}
                              onImport={handleImportClick}
                              hasSelectedRecords={hasSelectedRecords}
                              isAllRecordsSelected={isAllRecordsSelected}
                              pageRecordCount={pageRecordCount}
                              selectedRecordIdsCount={selectedRecordIds.length}
                              onSelectAllRecords={selectAllRecords}
                              onClearSelectedRecords={clearSelectedRecords}
                              sortedPresets={sortedPresets}
                              selectedPresetId={selectedPresetId}
                              onApplyPreset={applyPreset}
                              hasFilterSummary={hasFilterSummary}
                              hasSortSummary={hasSortSummary}
                              onClearFilters={handleClearFilters}
                              toolbarOverflowMenuItems={toolbarOverflowMenuItems}
                              onToolbarOverflow={handleToolbarOverflow}
                            />
                          ) : null
                        }
                      />
                    ) : null}
                    <Outlet />
                  </div>
                </>
              ) : (
                <Outlet />
              )}
            </div>
          </main>
        </div>
      </div>

      <FilterModal
        open={isFilterOpen}
        onCancel={() => setIsFilterOpen(false)}
        viewId={viewId}
        fields={fields}
        viewConfig={viewConfig}
        onUpdateViewConfig={updateViewConfig}
        onPresetSavedAsTab={() => setViewTabsReloadToken((value) => value + 1)}
      />

      <SortModal
        open={isSortOpen}
        onCancel={() => setIsSortOpen(false)}
        fields={fields}
        viewConfig={viewConfig}
        onUpdateViewConfig={updateViewConfig}
      />

      <CreateRecordModal
        open={isCreateRecordOpen}
        onCancel={() => setIsCreateRecordOpen(false)}
        tableId={tableId}
        fields={fields}
        viewConfig={viewConfig}
        cascadeRules={cascadeRules}
        tableReferenceMembers={tableReferenceMembers}
        onCreateRecord={createRecord}
      />

      <CustomModal
        open={isImportModalOpen}
        title="导入记录"
        onCancel={handleCloseImportModal}
        onOk={() => void handleConfirmImport()}
        okText="开始导入"
        cancelText="取消"
        width={680}
        confirmLoading={isImporting}
        cancelDisabled={isImporting}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="cm-text-secondary">上传 Excel 或 CSV 文件后，系统会按当前表字段批量导入记录。你也可以先下载示例模板再填写。</div>
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--line-soft)',
              background: 'var(--bg-elevated)',
            }}
          >
            <strong>上传说明</strong>
            <span className="cm-text-secondary">1. 仅读取第一个工作表，首行默认为表头。</span>
            <span className="cm-text-secondary">2. 表头可使用字段 ID、字段名或自定义显示名。</span>
            <span className="cm-text-secondary">3. 未匹配的列会被忽略，文件大小上限 {Math.round(MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024)}MB。</span>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="cm-btn" onClick={handleSelectImportFile} disabled={isImporting}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <UploadOutlined />
                  <span>{selectedImportFile ? '重新选择文件' : '选择文件'}</span>
                </span>
              </button>
              <button type="button" className="cm-btn" onClick={handleDownloadImportTemplate} disabled={isImporting}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <DownloadOutlined />
                  <span>下载示例模板</span>
                </span>
              </button>
            </div>
            <div className="cm-text-secondary">
              {selectedImportFile ? `已选择：${selectedImportFile.name}` : '尚未选择导入文件。'}
            </div>
          </div>
          {importDialogError ? (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: '1px solid rgba(214, 87, 70, 0.32)',
                background: 'rgba(214, 87, 70, 0.08)',
                color: 'var(--danger-strong, #b42318)',
                lineHeight: 1.5,
              }}
            >
              {importDialogError}
            </div>
          ) : null}
        </div>
      </CustomModal>

      <CustomModal
        open={isExportModalOpen}
        title="导出记录"
        onCancel={handleCloseExportModal}
        onOk={() => void handleConfirmExport()}
        okText="开始导出"
        cancelText="取消"
        width={680}
        confirmLoading={isExporting}
        cancelDisabled={isExporting}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="cm-text-secondary">请选择导出范围。导出的列以当前视图可见字段为准。</div>
          <label
            style={{
              display: 'grid',
              gap: 4,
              padding: 14,
              borderRadius: 12,
              border: exportScope === 'current_page' ? '1px solid var(--accent-strong)' : '1px solid var(--line-soft)',
              background: 'var(--bg-elevated)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="export-scope"
                checked={exportScope === 'current_page'}
                onChange={() => setExportScope('current_page')}
                disabled={isExporting}
              />
              <strong>当前页数据</strong>
            </span>
            <span className="cm-text-secondary">仅导出当前分页已加载的 {pageRecordCount} 条记录。</span>
          </label>
          <label
            style={{
              display: 'grid',
              gap: 4,
              padding: 14,
              borderRadius: 12,
              border: exportScope === 'all_records' ? '1px solid var(--accent-strong)' : '1px solid var(--line-soft)',
              background: 'var(--bg-elevated)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="export-scope"
                checked={exportScope === 'all_records'}
                onChange={() => setExportScope('all_records')}
                disabled={isExporting}
              />
              <strong>全部数据</strong>
            </span>
            <span className="cm-text-secondary">导出当前数据表的全部记录，忽略当前筛选条件。</span>
          </label>
          <label
            style={{
              display: 'grid',
              gap: 4,
              padding: 14,
              borderRadius: 12,
              border: exportScope === 'current_filters' ? '1px solid var(--accent-strong)' : '1px solid var(--line-soft)',
              background: 'var(--bg-elevated)',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="radio"
                name="export-scope"
                checked={exportScope === 'current_filters'}
                onChange={() => setExportScope('current_filters')}
                disabled={isExporting}
              />
              <strong>当前筛选结果</strong>
            </span>
            <span className="cm-text-secondary">
              {viewConfig.filters.length > 0 || viewConfig.sorts.length > 0
                ? `按当前视图的筛选/排序条件导出，当前命中 ${totalRecords} 条记录。`
                : '当前没有筛选条件，将按当前视图排序导出全部记录。'}
            </span>
          </label>
        </div>
      </CustomModal>

      {toast ? <div className="grid-toast">{toast}</div> : null}
    </div>
  )
}
