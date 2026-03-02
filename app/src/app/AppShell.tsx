import {
  ApiOutlined,
  AppstoreOutlined,
  BankOutlined,
  BgColorsOutlined,
  CloseCircleOutlined,
  DashboardOutlined,
  DownloadOutlined,
  FilterOutlined,
  LogoutOutlined,
  PictureOutlined,
  RetweetOutlined,
  SettingOutlined,
  SortAscendingOutlined,
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
import { THEME_STORAGE_KEY, resolveInitialTheme, type ThemeMode } from '../utils/theme'
import { AppShellHeader } from './components/AppShellHeader'
import { AppShellSidebar, type SidebarConfigItem } from './components/AppShellSidebar'
import { AppShellToolbar } from './components/AppShellToolbar'
import { useAppShellViewCatalog } from './hooks/useAppShellViewCatalog'
import { useAppShellRouteSync } from './hooks/useAppShellRouteSync'
import { tableItems } from '../config/tables'
const configRouteMap: Record<string, string> = {
  'config:views': 'config/views',
  'config:components': 'config/components',
  'config:showcase': 'config/showcase',
  'config:workflow': 'config/workflow',
  'config:dashboard': 'config/dashboard',
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
  const isDashboardConfigRoute = location.pathname.includes('/config/dashboard')
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
    isDashboardConfigRoute ||
    isMembersRoute ||
    isAiModelsRoute ||
    isFormSetupRoute
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
    isDashboardConfigRoute,
    isMembersRoute,
    isAiModelsRoute,
  })

  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [isCreateRecordOpen, setIsCreateRecordOpen] = useState(false)
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
    if (viewConfig.filters.length === 0) return
    const confirmed = await confirmAction({
      title: '确认清空当前筛选条件？',
      content: '清空后将展示当前视图全部记录。',
      okText: '确认清空',
      danger: true,
    })
    if (!confirmed) return
    updateViewConfig({ filters: [], filterLogic: 'and' })
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
      if (key === 'config:ai-models') {
        setToast('模型配置功能待开发，敬请期待。', 'info')
        return
      }
      if (key === 'config:page-settings') {
        setToast('页面设置功能待开发，敬请期待。', 'info')
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
    ...(toolbarCollapseToMore && canManageFilters && viewConfig.filters.length > 0
      ? [{ key: 'more:clearFilters', label: withMenuIcon(<CloseCircleOutlined />, '清空筛选') }]
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
      { key: 'config:dashboard', icon: <DashboardOutlined />, label: '大屏配置', status: 'enabled' },
      { key: 'config:ai-models', icon: <ApiOutlined />, label: '模型配置', status: 'soon' },
      ...(role === 'owner' ? [{ key: 'config:members', icon: <TeamOutlined />, label: '成员管理', status: 'enabled' as const }] : []),
      { key: 'config:page-settings', icon: <PictureOutlined />, label: '页面设置', status: 'soon' },
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
          : isDashboardConfigRoute
            ? 'config:dashboard'
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
          onOpenDashboard={() => navigate('/dashboard')}
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
              className="main-panel"
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
              <AppShellToolbar
                showGridToolbar={showGridToolbar}
                canManageFilters={canManageFilters}
                canManageSorts={canManageSorts}
                canCreateRecord={canCreateRecord}
                canDeleteSelectionNow={canDeleteSelectionNow}
                canExportRecords={canExportRecords}
                canImportRecords={canImportRecords}
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
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <FilterModal
        open={isFilterOpen}
        onCancel={() => setIsFilterOpen(false)}
        fields={fields}
        viewConfig={viewConfig}
        onUpdateViewConfig={updateViewConfig}
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
