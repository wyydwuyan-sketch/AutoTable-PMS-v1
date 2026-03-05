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
import { useGridStore } from '../features/grid/store/gridStore'
import { useAuthStore } from '../features/auth/authStore'
import { useShallow } from 'zustand/react/shallow'
import { FilterModal } from '../features/grid/components/modals/FilterModal'
import { SortModal } from '../features/grid/components/modals/SortModal'
import { CreateRecordModal } from '../features/grid/components/modals/CreateRecordModal'
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
import { tableItems } from '../config/tables'
const configRouteMap: Record<string, string> = {
  'config:views': 'config/views',
  'config:components': 'config/components',
  'config:showcase': 'config/showcase',
  'config:workflow': 'config/workflow',
  'config:ai-models': 'config/ai-models',
  'config:members': 'config/members',
}
const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024

const withMenuIcon = (icon: ReactNode, text: string) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', color: 'inherit' }}>{icon}</span>
    <span>{text}</span>
  </span>
)

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { baseId = 'base_1', tableId = 'tbl_1', viewId = 'viw_1' } = useParams()
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
  const isWorkflowRoute = location.pathname.includes('/config/workflow')
  const isMembersRoute = location.pathname.includes('/config/members')
  const isAiModelsRoute = location.pathname.includes('/config/ai-models')
  const isFormSetupRoute = location.pathname.includes('/form-setup')
  const isFormRoute = location.pathname.endsWith('/form')
  const isKanbanRoute = location.pathname.endsWith('/kanban')
  const isConfigLikeRoute =
    isViewManageRoute ||
    isComponentsRoute ||
    isShowcaseRoute ||
    isWorkflowRoute ||
    isMembersRoute ||
    isAiModelsRoute ||
    isFormSetupRoute
  const showViewTabs = !isConfigLikeRoute && !isFormRoute
  const showGridToolbar = !isConfigLikeRoute && !isFormRoute && !isKanbanRoute
  const canViewBusinessConfig = role === 'owner' || roleKey === 'admin'
  const { tableNameMap, visibleViews, sidebarVisibleViews } = useAppShellViewCatalog({
    tableItems,
    tableId,
    views,
  })
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
    isWorkflowRoute,
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
  const visibleFieldCount = useMemo(
    () => orderedFields.filter((field) => !hiddenFieldSet.has(field.id)).length,
    [hiddenFieldSet, orderedFields],
  )
  const toolbarCollapseToMore = viewportWidth < 1380
  const toolbarUltraCompact = viewportWidth < 1220
  const currentTableViews = useMemo(
    () => visibleViews.filter((view) => view.tableId === tableId),
    [visibleViews, tableId],
  )
  const activeView = useMemo(
    () => currentTableViews.find((view) => view.id === viewId) ?? currentTableViews[0] ?? null,
    [currentTableViews, viewId],
  )
  const configRouteAnchorView = useMemo(
    () =>
      sidebarVisibleViews.find((view) => view.id === viewId && view.tableId === tableId) ??
      visibleViews.find((view) => view.id === viewId) ??
      visibleViews[0] ??
      sidebarVisibleViews[0] ??
      views.find((view) => view.id === viewId && view.tableId === tableId) ??
      views[0] ??
      null,
    [sidebarVisibleViews, tableId, viewId, views, visibleViews],
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
    const confirmed = await confirmAction({
      title: '确认导出当前数据？',
      content: '将按当前可见字段与记录导出 Excel 文件。',
      okText: '确认导出',
    })
    if (!confirmed) return
    setIsExporting(true)
    try {
      const records = useGridStore.getState().records
      const formSettings = viewConfig.formSettings || {}
      const visibleFieldIds = formSettings.visibleFieldIds
      const fieldsToExport = visibleFieldIds ? fields.filter((f) => visibleFieldIds.includes(f.id)) : fields

      const data = records.map((record) => {
        const row: Record<string, unknown> = { ID: record.id }
        fieldsToExport.forEach((field) => {
          const label = formSettings.fieldConfig?.[field.id]?.label || field.name
          row[label] = record.values[field.id]
        })
        return row
      })

      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Records')
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      saveAs(blob, `export_${tableId}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      window.setTimeout(() => setIsExporting(false), 180)
    }
  }

  const handleImportClick = async () => {
    if (isImporting) return
    const confirmed = await confirmAction({
      title: '确认导入记录？',
      content: '请选择 Excel 文件继续导入。',
      okText: '继续导入',
    })
    if (!confirmed) return
    fileInputRef.current?.click()
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
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      setToast(`导入文件不能超过 ${Math.round(MAX_IMPORT_FILE_SIZE_BYTES / 1024 / 1024)}MB。`, 'warning')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setIsImporting(true)
    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
        const formSettings = viewConfig.formSettings || {}
        const mappedData = data.map((row) => {
          const values: Record<string, unknown> = {}
          Object.keys(row).forEach((key) => {
            const field = fields.find((f) => {
              const customLabel = formSettings.fieldConfig?.[f.id]?.label
              return f.id === key || f.name === key || customLabel === key
            })
            if (field) values[field.id] = row[key]
          })
          return values
        })
        await importRecords(tableId, mappedData)
      } catch (error) {
        setToast(getApiErrorMessage(error, '导入失败，请检查文件格式。'), 'error')
      } finally {
        setIsImporting(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.onerror = () => {
      setIsImporting(false)
      setToast('读取导入文件失败。', 'error')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    reader.readAsBinaryString(file)
  }

  const openConfigRoute = useCallback(
    (key: string) => {
      if (key === 'config:integrations') {
        navigate('/integrations')
        return
      }
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
        grid: '数据表视图',
        kanban: '数据看板',
        form: '表单视图',
      } as const
      const defaultNameMap = {
        grid: '新建数据表',
        kanban: '新建看板',
        form: '新建表单',
      } as const
      const name = await promptForText(`新增${labelMap[type]}`, defaultNameMap[type], '请输入视图名称')
      const nextName = name?.trim()
      if (!nextName) return
      const created = await createView(tableId, nextName, type)
      if (!created) return
      openSidebarView(created)
    },
    [createView, openSidebarView, tableId],
  )
  const addMenuItems = useMemo(
    () => [
      { key: 'add:view:grid', label: '新增数据表视图' },
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
      { key: 'config:workflow', icon: <RetweetOutlined />, label: '工作流配置', status: 'enabled' },
    ]
    : []
  const systemConfigItems: SidebarConfigItem[] = canViewBusinessConfig
    ? [
      { key: 'config:integrations', icon: <ApiOutlined />, label: '接口管理', status: 'enabled' },
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
        : isWorkflowRoute
          ? 'config:workflow'
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
            sidebarVisibleViews={sidebarVisibleViews}
            activeViewId={viewId}
            activeTableId={tableId}
            onOpenSidebarView={openSidebarView}
            tableNameMap={tableNameMap}
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
                      <h1 className="grid-page-title">{tableNameMap.get(tableId)?.name ?? '数据表'}</h1>
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
                    {currentTableViews.map((view) => {
                      const isActive = view.id === (activeView?.id ?? viewId)
                      const icon = view.type === 'kanban' ? <ProjectOutlined /> : view.type === 'form' ? <AppstoreOutlined /> : <TableOutlined />
                      const label = view.type === 'kanban' ? '数据看板' : view.type === 'form' ? '表单视图' : '表格数据'
                      return (
                        <button
                          key={view.id}
                          className={`view-mode-tab-item${isActive ? ' is-active' : ''}`}
                          onClick={() => openSidebarView(view)}
                        >
                          <span className="view-mode-tab-icon">{icon}</span>
                          <span>{view.name || label}</span>
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

      {toast ? <div className="grid-toast">{toast}</div> : null}
    </div>
  )
}
