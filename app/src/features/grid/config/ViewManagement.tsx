import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { AppstoreOutlined, FormOutlined, PlusOutlined, SettingOutlined, TableOutlined, UploadOutlined } from '@ant-design/icons'
import { DropdownMenu } from '../components/DropdownMenu'
import { CustomModal } from '../components/CustomModal'
import { CustomSelect } from '../components/CustomSelect'
import { useGridStore } from '../store/gridStore'
import type { Field, TableButtonPermissionItem, TableButtonPermissions, View } from '../types/grid'
import { gridApiClient } from '../api'
import { buildViewPath } from '../utils/viewRouting'
import { confirmAction } from '../../../utils/confirmAction'
import { tableItems } from '../../../config/tables'
import { useMultiTableFields } from '../../../app/hooks/useMultiTableFields'
import { useMultiTableViews } from '../../../app/hooks/useMultiTableViews'
import './ViewManagement.css'

const getOrderedFields = (view: View | undefined, tableFields: Field[]) => {
  if (!view) return tableFields
  const fieldOrderIds = view.config.fieldOrderIds ?? tableFields.map((field) => field.id)
  const indexMap = new Map(fieldOrderIds.map((id, index) => [id, index]))
  return [...tableFields].sort((a, b) => {
    const ai = indexMap.get(a.id)
    const bi = indexMap.get(b.id)
    const ao = ai === undefined ? Number.MAX_SAFE_INTEGER : ai
    const bo = bi === undefined ? Number.MAX_SAFE_INTEGER : bi
    return ao - bo
  })
}

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

export function ViewManagement() {
  const navigate = useNavigate()
  const location = useLocation()
  const { baseId = 'base_1', tableId = 'tbl_1', viewId = 'viw_1' } = useParams()

  const storeViews = useGridStore((state) => state.views)
  const storeFields = useGridStore((state) => state.fields)
  const createView = useGridStore((state) => state.createView)
  const deleteView = useGridStore((state) => state.deleteView)
  const setViewEnabled = useGridStore((state) => state.setViewEnabled)
  const renameView = useGridStore((state) => state.renameView)
  const moveView = useGridStore((state) => state.moveView)
  const removeFieldFromView = useGridStore((state) => state.removeFieldFromView)
  const moveFieldInView = useGridStore((state) => state.moveFieldInView)
  const setFieldOrderInView = useGridStore((state) => state.setFieldOrderInView)
  const setToast = useGridStore((state) => state.setToast)

  const [newViewName, setNewViewName] = useState('')
  const [newViewType, setNewViewType] = useState<'grid' | 'form'>('grid')
  const [newFormMode, setNewFormMode] = useState<'setup' | 'quick'>('setup')
  const [newViewTargetTableId, setNewViewTargetTableId] = useState(tableId)
  const [isCreateViewOpen, setIsCreateViewOpen] = useState(false)
  const [isCreatingView, setIsCreatingView] = useState(false)
  const [isImportingView, setIsImportingView] = useState(false)
  const [importTargetTableId, setImportTargetTableId] = useState(tableId)
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null)
  const [buttonPermissionRows, setButtonPermissionRows] = useState<TableButtonPermissionItem[]>([])
  const [buttonPermissionBaseline, setButtonPermissionBaseline] = useState('[]')
  const [buttonPermissionLoading, setButtonPermissionLoading] = useState(false)
  const [buttonPermissionSaving, setButtonPermissionSaving] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const { viewsByTableId, allViews, isLoading: multiTableViewsLoading, refreshViews } = useMultiTableViews({
    tableItems,
    storeViews,
    activeTableId: tableId,
  })
  const { fieldsByTableId, isLoading: multiTableFieldsLoading } = useMultiTableFields({
    tableItems,
  })
  const sortedViewsByTableId = useMemo(
    () =>
      Object.fromEntries(
        tableItems.map((item) => [
          item.id,
          [...(viewsByTableId[item.id] ?? [])].sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0)),
        ]),
      ) as Record<string, View[]>,
    [viewsByTableId],
  )
  const tableViews = useMemo(
    () => sortedViewsByTableId[tableId] ?? [],
    [sortedViewsByTableId, tableId],
  )
  const tableFields = useMemo(
    () => fieldsByTableId[tableId] ?? storeFields.filter((field) => field.tableId === tableId),
    [fieldsByTableId, storeFields, tableId],
  )
  const tableNameById = useMemo(
    () =>
      Object.fromEntries(tableItems.map((item) => [item.id, item.name])) as Record<string, string>,
    [],
  )
  const viewTableSections = useMemo(
    () =>
      tableItems.map((item) => ({
        tableId: item.id,
        tableName: item.name,
        views: sortedViewsByTableId[item.id] ?? [],
      })),
    [sortedViewsByTableId],
  )
  const editView = allViews.find((item) => item.id === editingViewId) ?? undefined
  const editTableId = editView?.tableId ?? tableId
  const editTableFields = useMemo(
    () => fieldsByTableId[editTableId] ?? (editTableId === tableId ? tableFields : []),
    [editTableId, fieldsByTableId, tableFields, tableId],
  )
  const orderedFields = useMemo(() => getOrderedFields(editView, editTableFields), [editTableFields, editView])
  const hiddenSet = useMemo(() => new Set(editView?.config.hiddenFieldIds ?? []), [editView?.config.hiddenFieldIds])
  const visibleFields = useMemo(() => orderedFields.filter((field) => !hiddenSet.has(field.id)), [hiddenSet, orderedFields])
  const hasCreateViewDraft = newViewName.trim().length > 0 || newViewType !== 'grid' || newFormMode !== 'setup'
  const hasButtonPermissionDraft =
    editView?.type === 'grid' && serializeButtonPermissionRows(buttonPermissionRows) !== buttonPermissionBaseline
  const hasViewSettingDraft = !!hasButtonPermissionDraft

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
        if (active) {
          setButtonPermissionLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [editView, editView?.id, editView?.tableId, editView?.type, setToast])

  const promptForInputText = async (title: string, initialValue = '', placeholder = '请输入内容') => {
    const { promptForText } = await import('../../../utils/promptForText')
    return promptForText(title, initialValue, placeholder)
  }

  const goToView = (targetView: View) => {
    navigate(buildViewPath(baseId, targetView.tableId, targetView))
  }

  const resetCreateViewDraft = () => {
    setNewViewName('')
    setNewViewType('grid')
    setNewFormMode('setup')
    setNewViewTargetTableId(tableId)
  }

  const openCreateViewModal = (targetTableId = tableId) => {
    setNewViewName('')
    setNewViewType('grid')
    setNewFormMode('setup')
    setNewViewTargetTableId(targetTableId)
    setIsCreateViewOpen(true)
  }

  const handleCreate = async () => {
    if (isCreatingView) {
      return
    }
    const name = newViewName.trim()
    if (!name) {
      setToast('请先输入视图名称。')
      return
    }
    const confirmed = await confirmAction({
      title: `确认创建视图「${name}」？`,
      okText: '确认创建',
    })
    if (!confirmed) return
    setIsCreatingView(true)
    try {
      const targetTableId = newViewTargetTableId || tableId
      const targetTableFields = fieldsByTableId[targetTableId] ?? []
      const isCurrentTableTarget = targetTableId === tableId

      let created = isCurrentTableTarget
        ? await createView(targetTableId, name, newViewType)
        : await gridApiClient.createView(targetTableId, name, newViewType)
      if (!created) return
      if (!isCurrentTableTarget && newViewType === 'grid') {
        created = await gridApiClient.updateView(created.id, {
          config: {
            ...created.config,
            hiddenFieldIds: targetTableFields.map((field) => field.id),
            compactEmptyRows: true,
          },
        })
      }
      if (newViewType === 'form') {
        const visibleFieldIds = newFormMode === 'quick' ? targetTableFields.map((field) => field.id) : []
        created = await gridApiClient.updateView(created.id, {
          config: {
            ...created.config,
            formSettings: {
              visibleFieldIds,
              fieldConfig: {},
              cascadeRules: [],
            },
          },
        })
        if (!isCurrentTableTarget) {
          refreshViews()
        }
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.id}/form-setup`)
      } else {
        if (!isCurrentTableTarget) {
          refreshViews()
        }
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.id}/config/components?setup=1`)
      }
      resetCreateViewDraft()
      setIsCreateViewOpen(false)
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

  const moveViewInTable = async (targetId: string, direction: 'up' | 'down') => {
    const target = allViews.find((view) => view.id === targetId)
    if (!target) return false

    if (target.tableId === tableId) {
      return moveView(targetId, direction)
    }

    const sameTableViews = sortedViewsByTableId[target.tableId] ?? []
    const index = sameTableViews.findIndex((view) => view.id === targetId)
    if (index < 0) return false
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= sameTableViews.length) return false

    const current = sameTableViews[index]
    const neighbor = sameTableViews[nextIndex]
    const currentOrder = current.config.order ?? index
    const neighborOrder = neighbor.config.order ?? nextIndex

    try {
      await Promise.all([
        gridApiClient.updateView(current.id, {
          config: { ...current.config, order: neighborOrder },
        }),
        gridApiClient.updateView(neighbor.id, {
          config: { ...neighbor.config, order: currentOrder },
        }),
      ])
      refreshViews()
      return true
    } catch {
      setToast('调整视图顺序失败。')
      return false
    }
  }

  const saveEditingViewFieldOrder = async (nextFieldOrderIds: string[]) => {
    if (!editView) return null
    if (editView.tableId === tableId) {
      return setFieldOrderInView(editView.id, nextFieldOrderIds)
    }
    const tableFieldIds = editTableFields.map((field) => field.id)
    const normalized = [
      ...nextFieldOrderIds.filter((id) => tableFieldIds.includes(id)),
      ...tableFieldIds.filter((id) => !nextFieldOrderIds.includes(id)),
    ]
    try {
      const updated = await gridApiClient.updateView(editView.id, {
        config: {
          ...editView.config,
          fieldOrderIds: normalized,
        },
      })
      refreshViews()
      return updated
    } catch {
      setToast('保存字段顺序失败。')
      return null
    }
  }

  const handleDelete = async (targetId: string, name: string) => {
    const confirmed = await confirmAction({
      title: `确认删除视图「${name}」吗？`,
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    const target = allViews.find((view) => view.id === targetId)
    if (!target) return

    if (target.tableId !== tableId) {
      try {
        await gridApiClient.deleteView(targetId)
        if (editingViewId === targetId) {
          setEditingViewId(null)
          setDraggingFieldId(null)
        }
        refreshViews()
        setToast('视图已删除。')
      } catch {
        setToast('删除视图失败。')
      }
      return
    }

    const nextViewId = await deleteView(targetId)
    if (!nextViewId) return
    const next = tableViews.find((v) => v.id === nextViewId)
    const isConfigViewsRoute = location.pathname.endsWith('/config/views')
    if (!next) {
      navigate(`/b/${baseId}/t/${tableId}/v/${nextViewId}${isConfigViewsRoute ? '/config/views' : ''}`)
      return
    }
    if (isConfigViewsRoute) {
      navigate(`/b/${baseId}/t/${tableId}/v/${next.id}/config/views`)
      return
    }
    goToView(next)
  }

  const handleRename = async (targetId: string, currentName: string) => {
    const nextName = await promptForInputText('请输入新的视图名称', currentName, '视图名称')
    if (!nextName) return
    const target = allViews.find((view) => view.id === targetId)
    if (!target) return
    if (target.tableId === tableId) {
      await renameView(targetId, nextName)
      return
    }
    try {
      await gridApiClient.updateView(targetId, { name: nextName.trim() })
      refreshViews()
      setToast('视图名称已更新。')
    } catch {
      setToast('重命名视图失败。')
    }
  }

  const handleToggleEnabled = async (targetId: string, enabled: boolean) => {
    const target = allViews.find((view) => view.id === targetId)
    if (!target) return
    const sameTableViews = sortedViewsByTableId[target.tableId] ?? []
    const enabledCount = sameTableViews.filter((view) => view.config.isEnabled !== false).length
    if (!enabled && target.config.isEnabled !== false && enabledCount <= 1) {
      setToast('至少保留一个启用中的视图。')
      return
    }
    if (target.tableId === tableId) {
      const updated = await setViewEnabled(targetId, enabled)
      if (!updated) return
      if (viewId === targetId && !enabled) {
        const available = tableViews.find((view) => view.id !== targetId && view.config.isEnabled !== false)
        if (available) {
          goToView(available)
        }
      }
      return
    }
    try {
      await gridApiClient.updateView(targetId, {
        config: {
          ...target.config,
          isEnabled: enabled,
        },
      })
      refreshViews()
      setToast(enabled ? '视图已启用。' : '视图已停用。')
    } catch {
      setToast('更新视图启用状态失败。')
    }
  }

  const handlePinViewToTop = async (targetId: string) => {
    const target = allViews.find((view) => view.id === targetId)
    if (!target) return
    const sameTableViews = sortedViewsByTableId[target.tableId] ?? []
    const index = sameTableViews.findIndex((item) => item.id === targetId)
    if (index <= 0) {
      return
    }
    for (let step = 0; step < index; step += 1) {
      const moved = await moveViewInTable(targetId, 'up')
      if (!moved) {
        break
      }
    }
  }

  const handleMoveFieldInEditingView = async (fieldId: string, direction: 'up' | 'down') => {
    if (!editView) return
    if (editView.tableId === tableId) {
      await moveFieldInView(editView.id, fieldId, direction)
      return
    }
    const tableFieldIds = editTableFields.map((field) => field.id)
    const existingOrder = editView.config.fieldOrderIds ?? []
    const merged = [
      ...existingOrder.filter((id) => tableFieldIds.includes(id)),
      ...tableFieldIds.filter((id) => !existingOrder.includes(id)),
    ]
    const currentIndex = merged.findIndex((id) => id === fieldId)
    if (currentIndex < 0) return
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (nextIndex < 0 || nextIndex >= merged.length) return
    ;[merged[currentIndex], merged[nextIndex]] = [merged[nextIndex], merged[currentIndex]]
    await saveEditingViewFieldOrder(merged)
  }

  const handleDropVisibleField = async (targetFieldId: string) => {
    if (!editView || !draggingFieldId || draggingFieldId === targetFieldId) {
      setDraggingFieldId(null)
      return
    }
    const currentVisibleIds = visibleFields.map((field) => field.id)
    const sourceIndex = currentVisibleIds.findIndex((id) => id === draggingFieldId)
    const targetIndex = currentVisibleIds.findIndex((id) => id === targetFieldId)
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggingFieldId(null)
      return
    }
    const nextVisibleIds = [...currentVisibleIds]
    const [moved] = nextVisibleIds.splice(sourceIndex, 1)
    nextVisibleIds.splice(targetIndex, 0, moved)
    const hiddenIds = orderedFields.filter((field) => hiddenSet.has(field.id)).map((field) => field.id)
    await saveEditingViewFieldOrder([...nextVisibleIds, ...hiddenIds])
    setDraggingFieldId(null)
  }

  const handleImportViewClick = async (targetTableId = tableId) => {
    if (isImportingView) return
    const confirmed = await confirmAction({
      title: '确认导入视图？',
      content: '将选择 Excel 文件并创建新视图。',
      okText: '继续导入',
    })
    if (!confirmed) return
    setImportTargetTableId(targetTableId)
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
        const viewName = await promptForInputText('请输入导入后视图名称', defaultName, '导入视图名称')
        if (!viewName) return

        const resultPayload = rows.map((row) => {
          const values: Record<string, unknown> = {}
          headers.forEach((header) => {
            values[header] = row[header] ?? null
          })
          return values
        })
        const targetTableId = importTargetTableId || tableId
        const created = await gridApiClient.importViewBundle(targetTableId, {
          viewName,
          viewType: 'grid',
          fields: headers.map((header) => ({ name: header, type: 'text', width: 180 })),
          records: resultPayload,
        })
        if (targetTableId !== tableId) {
          refreshViews()
        }
        navigate(`/b/${baseId}/t/${targetTableId}/v/${created.viewId}`)
      } catch {
        setToast('导入视图失败，请检查文件格式。')
      } finally {
        setIsImportingView(false)
        if (importInputRef.current) {
          importInputRef.current.value = ''
        }
      }
    }
    reader.onerror = () => {
      setIsImportingView(false)
      setToast('读取导入文件失败。')
      if (importInputRef.current) {
        importInputRef.current.value = ''
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleToggleButtonPermission = (
    userId: string,
    key: keyof TableButtonPermissions,
    checked: boolean,
  ) => {
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
    if (buttonPermissionRows.length === 0) {
      return
    }
    const confirmed = await confirmAction({
      title: '确认恢复默认按钮权限（全开）？',
      content: '未保存的权限勾选将被重置。',
      okText: '确认恢复',
      danger: true,
    })
    if (!confirmed) return
    setButtonPermissionRows((prev) =>
      prev.map((row) => ({
        ...row,
        buttons: { ...defaultTableButtonPermissions },
      })),
    )
  }

  const handleRemoveFieldFromCurrentView = async (field: Field) => {
    if (!editView) return
    const confirmed = await confirmAction({
      title: `确认从视图移除字段「${field.name}」？`,
      content: '仅移出当前视图，不会删除字段本身。',
      okText: '确认移除',
      danger: true,
    })
    if (!confirmed) return
    if (editView.tableId === tableId) {
      await removeFieldFromView(editView.id, field.id)
      return
    }
    try {
      const hiddenSet = new Set(editView.config.hiddenFieldIds ?? [])
      hiddenSet.add(field.id)
      await gridApiClient.updateView(editView.id, {
        config: {
          ...editView.config,
          hiddenFieldIds: [...hiddenSet],
          frozenFieldIds: (editView.config.frozenFieldIds ?? []).filter((id) => id !== field.id),
        },
      })
      refreshViews()
      setToast('字段已从该视图移除。')
    } catch {
      setToast('从视图移除字段失败。')
    }
  }

  const saveTableViewButtons = async () => {
    if (buttonPermissionRows.length === 0) {
      return
    }
    const confirmed = await confirmAction({
      title: '确认保存当前按钮权限配置？',
      okText: '确认保存',
    })
    if (!confirmed) return
    setButtonPermissionSaving(true)
    try {
      if (!editView) return
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
    if (hasViewSettingDraft) {
      const confirmed = await confirmAction({
        title: '放弃未保存的视图设置更改？',
        content: '关闭后当前按钮权限草稿将丢失。',
        okText: '放弃并关闭',
        danger: true,
      })
      if (!confirmed) return
    }
    setEditingViewId(null)
    setDraggingFieldId(null)
  }

  return (
    <div className="grid-root vm-page">
      <input
        type="file"
        ref={importInputRef}
        style={{ display: 'none' }}
        accept=".xlsx,.xls,.csv"
        onChange={handleImportViewFileChange}
      />
      <div className="vm-header">
        <div className="vm-header-info">
          <h3 className="vm-title">业务配置 / 视图管理</h3>
          <p className="vm-subtitle">
            在这里统一维护视图：新增、删除、启用/停用。字段结构与组件样式请进入"字段配置"页面处理。
          </p>
        </div>
        <div className="vm-header-actions">
          <button className="cm-btn" onClick={() => void handleImportViewClick(tableId)} disabled={isCreatingView || isImportingView}>
            <UploadOutlined /> 导入当前表视图
          </button>
          <button
            className="cm-btn cm-btn--primary"
            onClick={() => openCreateViewModal(tableId)}
          >
            <PlusOutlined /> 新增当前表视图
          </button>
        </div>
      </div>

      <div className="vm-table-sections">
        {viewTableSections.map((section) => {
          const enabledViews = section.views.filter((view) => view.config.isEnabled !== false).length
          return (
            <section key={section.tableId} className="vm-table-section">
              <div className="vm-table-section-header">
                <div className="vm-table-section-title">
                  <span className="vm-table-section-icon"><AppstoreOutlined /></span>
                  <div className="vm-table-section-texts">
                    <strong>{section.tableName}</strong>
                    <span>{section.views.length} 个视图 · {enabledViews} 个已启用</span>
                  </div>
                </div>
                <div className="vm-table-section-actions">
                  <button
                    className="cm-btn cm-btn--sm"
                    onClick={() => void handleImportViewClick(section.tableId)}
                    disabled={isImportingView}
                  >
                    <UploadOutlined /> 导入
                  </button>
                  <button
                    className="cm-btn cm-btn--sm cm-btn--primary"
                    onClick={() => openCreateViewModal(section.tableId)}
                    disabled={isCreatingView}
                  >
                    <PlusOutlined /> 新增视图
                  </button>
                </div>
              </div>

              {section.views.length === 0 ? (
                <div className="vm-table-empty">
                  {multiTableViewsLoading ? '正在加载视图...' : '暂无视图，可在该分组中新增或导入。'}
                </div>
              ) : (
                <div className="vm-view-grid">
                  {section.views.map((view, index) => {
                    const isCurrent = view.id === viewId
                    const isEnabled = view.config.isEnabled !== false
                    const viewTypeLabel = view.type === 'form' ? '表单视图' : '表格视图'
                    return (
                      <div
                        key={view.id}
                        className={`vm-view-card ${isCurrent ? 'vm-view-card--current' : ''}`}
                      >
                        <div className="vm-card-header">
                          <div className="vm-card-title-row">
                            <span className="vm-card-icon" aria-hidden="true">
                              {view.type === 'form' ? <FormOutlined /> : <TableOutlined />}
                            </span>
                            <span className="vm-card-name" title={view.name}>{view.name}</span>
                          </div>
                          {isCurrent ? (
                            <span className="vm-card-badge vm-card-badge--current">当前</span>
                          ) : null}
                        </div>
                        <div className="vm-card-meta">
                          <span className="vm-card-status">
                            <span className={`vm-card-status-dot ${isEnabled ? 'vm-card-status-dot--enabled' : 'vm-card-status-dot--disabled'}`} />
                            {isEnabled ? '已启用' : '已停用'}
                          </span>
                          <span className="vm-card-type">{viewTypeLabel}</span>
                          <span className="vm-card-table-tag">{tableNameById[view.tableId] ?? view.tableId}</span>
                        </div>
                        <div className="vm-card-actions">
                          <button className="cm-btn cm-btn--sm" onClick={() => goToView(view)}>打开</button>
                          <button
                            className="cm-btn cm-btn--sm"
                            onClick={() =>
                              navigate(
                                view.type === 'form'
                                  ? `/b/${baseId}/t/${view.tableId}/v/${view.id}/form-setup`
                                  : `/b/${baseId}/t/${view.tableId}/v/${view.id}/config/components`,
                              )
                            }
                          >
                            <SettingOutlined /> 配置
                          </button>
                          <DropdownMenu
                            items={[
                              { key: 'viewSettings', label: '视图设置' },
                              { key: 'rename', label: '重命名' },
                              {
                                key: 'enabled',
                                label: isEnabled ? '停用视图' : '启用视图',
                              },
                              { type: 'divider' },
                              { key: 'pinTop', label: '置顶', disabled: index === 0 },
                              { key: 'moveUp', label: '上移', disabled: index === 0 },
                              { key: 'moveDown', label: '下移', disabled: index === section.views.length - 1 },
                              { type: 'divider' },
                              { key: 'delete', label: '删除视图', danger: true },
                            ]}
                            onClick={({ key }) => {
                              if (key === 'viewSettings') {
                                setEditingViewId(view.id)
                                return
                              }
                              if (key === 'rename') {
                                void handleRename(view.id, view.name)
                                return
                              }
                              if (key === 'enabled') {
                                void handleToggleEnabled(view.id, !isEnabled)
                                return
                              }
                              if (key === 'pinTop') {
                                void handlePinViewToTop(view.id)
                                return
                              }
                              if (key === 'moveUp') {
                                void moveViewInTable(view.id, 'up')
                                return
                              }
                              if (key === 'moveDown') {
                                void moveViewInTable(view.id, 'down')
                                return
                              }
                              if (key === 'delete') {
                                void handleDelete(view.id, view.name)
                              }
                            }}
                          >
                            <button className="cm-btn cm-btn--sm">⋮</button>
                          </DropdownMenu>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <CustomModal
        open={isCreateViewOpen}
        title="新增视图"
        onCancel={() => void closeCreateViewModal()}
        onOk={() => void handleCreate()}
        confirmLoading={isCreatingView}
        cancelDisabled={isCreatingView}
        okText="保存"
        cancelText="取消"
      >
        <div className="form-group">
          <label className="form-label">视图名称</label>
          <input
            className="cm-input"
            placeholder="输入视图名称"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">目标数据表</label>
          <CustomSelect
            value={newViewTargetTableId}
            onChange={(value) => setNewViewTargetTableId(value ?? tableId)}
            options={tableItems.map((item) => ({ value: item.id, label: item.name }))}
          />
          {multiTableFieldsLoading ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>正在加载目标表字段...</div>
          ) : null}
        </div>
        <div className="form-group">
          <label className="form-label">视图类型</label>
          <CustomSelect
            value={newViewType}
            onChange={(value) => setNewViewType((value ?? 'grid') as 'grid' | 'form')}
            options={[
              { value: 'grid', label: '表格视图' },
              { value: 'form', label: '表单视图' },
            ]}
          />
        </div>
        {newViewType === 'form' ? (
          <div className="form-group">
            <label className="form-label">创建方式</label>
            <CustomSelect
              value={newFormMode}
              onChange={(value) => setNewFormMode((value ?? 'setup') as 'setup' | 'quick')}
              options={[
                { value: 'setup', label: '空白设计（推荐）' },
                { value: 'quick', label: '快速生成（默认展示全部字段，进入表单设计）' },
              ]}
            />
          </div>
        ) : null}
      </CustomModal>

      <CustomModal
        open={!!editView}
        title={editView ? `视图设置 · ${editView.name}` : '视图设置'}
        onCancel={() => void closeFieldConfigModal()}
        width={1080}
        cancelText="关闭"
        cancelDisabled={buttonPermissionSaving}
      >
        {editView ? (
          <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
              当前页面仅维护该视图的显示顺序与按钮权限。字段类型与组件样式已统一到“表格组件”页面。
            </div>

            <div
              style={{
                border: '1px solid #bfdbfe',
                borderRadius: 8,
                padding: 12,
                background: '#eff6ff',
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: '#1e3a8a' }}>
                {editView.type === 'form'
                  ? '需要调整表单字段显示、顺序、必填与提示，请前往“表单设计”。'
                  : '需要新增字段、修改字段类型、配置下拉/成员等组件时，请前往“表格组件”。'}
              </span>
              <button
                className="cm-btn cm-btn--primary"
                onClick={() => {
                  navigate(
                    editView.type === 'form'
                      ? `/b/${baseId}/t/${editView.tableId}/v/${editView.id}/form-setup`
                      : `/b/${baseId}/t/${editView.tableId}/v/${editView.id}/config/components`,
                  )
                  setEditingViewId(null)
                }}
              >
                {editView.type === 'form' ? '前往表单设计' : '前往表格组件'}
              </button>
            </div>

            <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>当前显示字段（支持排序）</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                {visibleFields.map((field, index) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => setDraggingFieldId(field.id)}
                    onDragEnd={() => setDraggingFieldId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => void handleDropVisibleField(field.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      alignItems: 'center',
                      gap: 8,
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      padding: '8px 10px',
                      cursor: 'grab',
                      background: draggingFieldId === field.id ? 'var(--surface-subtle)' : 'white',
                    }}
                  >
                    <span>{field.name}</span>
                    <button className="cm-btn cm-btn--sm" onClick={() => void handleMoveFieldInEditingView(field.id, 'up')} disabled={index === 0}>
                      上移
                    </button>
                    <button className="cm-btn cm-btn--sm" onClick={() => void handleMoveFieldInEditingView(field.id, 'down')} disabled={index === visibleFields.length - 1}>
                      下移
                    </button>
                    <button className="cm-btn cm-btn--sm" onClick={() => void handleRemoveFieldFromCurrentView(field)}>移除</button>
                  </div>
                ))}
                {visibleFields.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>当前无显示字段。</div> : null}
              </div>
            </div>

            {editView.type === 'grid' ? (
              <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: 12, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>表格视图按钮权限</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      仅控制表格视图入口，默认全开。
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="cm-btn cm-btn--sm"
                      onClick={() => void resetTableViewButtonsToDefault()}
                      disabled={buttonPermissionLoading || buttonPermissionRows.length === 0}
                    >
                      恢复全开
                    </button>
                    <button
                      className="cm-btn cm-btn--sm cm-btn--primary"
                      onClick={() => void saveTableViewButtons()}
                      disabled={buttonPermissionLoading || buttonPermissionRows.length === 0 || buttonPermissionSaving}
                    >
                      {buttonPermissionSaving ? '保存中...' : '保存权限'}
                    </button>
                  </div>
                </div>

                {buttonPermissionLoading ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>正在加载按钮权限...</span>
                ) : buttonPermissionRows.length === 0 ? (
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>当前没有可配置的成员权限。</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {buttonPermissionRows.map((row) => (
                      <div
                        key={row.userId}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          padding: 10,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 120, fontWeight: 500, paddingTop: 2 }}>{row.username}</div>
                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
                          {tableButtonPermissionItems.map((item) => (
                            <label key={item.key} className="cm-checkbox-label">
                              <input
                                type="checkbox"
                                className="cm-checkbox"
                                checked={row.buttons[item.key]}
                                onChange={(event) =>
                                  handleToggleButtonPermission(row.userId, item.key, event.target.checked)
                                }
                              />
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
