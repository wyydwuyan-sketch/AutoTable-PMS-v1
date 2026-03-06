import { create } from 'zustand'
import { gridApiClient } from '../api'
import type {
  CascadeRule,
  Field,
  FieldOption,
  FieldType,
  FocusedCell,
  RecordModel,
  ReferenceMember,
  TableButtonPermissions,
  View,
  ViewConfig,
} from '../types/grid'
import { inferCascadeRules } from '../utils/cascadeRules'
import { createDefaultViewConfig } from '../utils/viewConfig'

export interface GridFilter {
  fieldId: string
  keyword: string
}

export interface ImportRecordInput {
  values: Record<string, unknown>
  rowNumber: number
}

export interface ImportRecordsResult {
  successCount: number
  failedCount: number
  failureMessages: string[]
}

interface GridState {
  activeTableId: string | null
  activeViewId: string | null
  fields: Field[]
  tableReferenceMembers: ReferenceMember[]
  records: RecordModel[]
  totalRecords: number
  recordSnapshots: Record<string, Record<string, unknown>>
  selectedRecordIds: string[]
  isAllRecordsSelected: boolean
  views: View[]
  cascadeRules: CascadeRule[]
  focusedCell: FocusedCell | null
  editingCell: FocusedCell | null
  drawerRecordId: string | null
  viewConfig: ViewConfig
  tableButtonPermissions: TableButtonPermissions
  filter: GridFilter | null
  isLoading: boolean
  toast: string | null
  setData: (
    tableId: string,
    viewId: string,
    fields: Field[],
    tableReferenceMembers: ReferenceMember[],
    records: RecordModel[],
    views: View[],
    viewConfig: ViewConfig,
    totalRecords?: number,
    tableButtonPermissions?: TableButtonPermissions,
  ) => void
  setRecordsPage: (records: RecordModel[], totalRecords: number) => void
  setFocusedCell: (cell: FocusedCell | null) => void
  setEditingCell: (cell: FocusedCell | null) => void
  openDrawer: (recordId: string) => void
  closeDrawer: () => void
  upsertRecord: (record: RecordModel) => void
  updateCellLocal: (rowId: string, fieldId: string, value: unknown) => void
  submitCellPatch: (rowId: string, patch: Record<string, unknown>) => Promise<void>
  createRecord: (tableId: string, initialValues?: Record<string, unknown>) => Promise<void>
  deleteRecord: (recordId: string) => Promise<void>
  toggleRecordSelected: (recordId: string) => void
  setRecordSelection: (recordIds: string[], selected: boolean) => void
  clearSelectedRecords: () => void
  selectAllRecords: () => void
  deleteSelectedRecords: () => Promise<void>
  createField: (tableId: string, name: string, type: FieldType, options?: FieldOption[]) => Promise<Field | null>
  createFieldForView: (tableId: string, viewId: string, name: string, type: FieldType, options?: FieldOption[]) => Promise<Field | null>
  addFieldToView: (viewId: string, fieldId: string) => Promise<View | null>
  removeFieldFromView: (viewId: string, fieldId: string) => Promise<View | null>
  moveFieldInView: (viewId: string, fieldId: string, direction: 'up' | 'down') => Promise<View | null>
  setFieldOrderInView: (viewId: string, fieldOrderIds: string[]) => Promise<View | null>
  deleteField: (fieldId: string) => Promise<void>
  importRecords: (tableId: string, records: ImportRecordInput[]) => Promise<ImportRecordsResult>
  createView: (
    tableId: string,
    name: string,
    type: 'grid' | 'form' | 'kanban',
    initialConfig?: Partial<ViewConfig>,
    options?: {
      folderId?: string | null
      sourceViewId?: string | null
      viewRole?: 'primary' | 'derived'
    },
  ) => Promise<View | null>
  deleteView: (viewId: string) => Promise<string | null>
  setViewEnabled: (viewId: string, enabled: boolean) => Promise<View | null>
  renameView: (viewId: string, name: string) => Promise<View | null>
  moveView: (viewId: string, direction: 'up' | 'down') => Promise<boolean>
  refreshRecords: () => Promise<void>
  setCascadeRule: (rule: CascadeRule) => void
  removeCascadeRule: (ruleId: string) => void
  moveCascadeRule: (ruleId: string, direction: 'up' | 'down') => void
  setFilter: (filter: GridFilter | null) => void
  setColumnWidth: (fieldId: string, width: number) => void
  setHiddenFields: (fieldIds: string[]) => void
  updateViewConfig: (config: Partial<ViewConfig>) => void
  setToast: (message: string | null, level?: 'success' | 'info' | 'warning' | 'error') => void
  setLoading: (loading: boolean) => void
}

const CASCADE_RULES_KEY = 'grid_cascade_rules'
const OPERATION_LOGS_KEY = 'grid_operation_logs'
const OPERATION_LOG_EVENT = 'grid_operation_logs_updated'
const MAX_CLIENT_RECORDS = 500
const IMPORT_BATCH_SIZE = 100
const IMPORT_CONCURRENCY = 8
const MAX_IMPORT_FAILURE_DETAILS = 3

const defaultTableButtonPermissions: TableButtonPermissions = {
  canCreateRecord: true,
  canDeleteRecord: true,
  canImportRecords: true,
  canExportRecords: true,
  canManageFilters: true,
  canManageSorts: true,
}

type OperationLogAction = 'create_record' | 'update_record' | 'delete_record' | 'import_records'

type OperationLogItem = {
  id: string
  tableId: string
  action: OperationLogAction
  message: string
  recordId?: string
  changedFields?: string[]
  fieldChanges?: Array<{
    fieldId: string
    fieldName: string
    oldValue: unknown
    newValue: unknown
  }>
  count?: number
  createdAt: string
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

const dedupeMessages = (messages: string[]) => Array.from(new Set(messages))

const formatImportFailureSummary = (messages: string[], failedCount: number) => {
  const uniqueMessages = dedupeMessages(messages)
  const sample = uniqueMessages.slice(0, MAX_IMPORT_FAILURE_DETAILS)
  if (sample.length === 0) {
    return failedCount > 0 ? `共 ${failedCount} 条导入失败，请检查数据格式。` : '导入失败，请检查数据格式。'
  }
  const remaining = Math.max(0, failedCount - sample.length)
  return remaining > 0 ? `${sample.join('；')}；另有 ${remaining} 条失败` : sample.join('；')
}

const normalizeValueForCompare = (value: unknown): unknown => {
  if (value === '') return null
  if (Array.isArray(value)) return value.map(normalizeValueForCompare)
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeValueForCompare(v)])
    return Object.fromEntries(entries)
  }
  return value ?? null
}

const isEqualValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(normalizeValueForCompare(left)) === JSON.stringify(normalizeValueForCompare(right))

const createRecordSnapshots = (records: RecordModel[]) =>
  Object.fromEntries(records.map((record) => [record.id, { ...record.values }]))

const toGridFilter = (config: ViewConfig): GridFilter | null => {
  const first = config.filters[0]
  if (!first || typeof first.fieldId !== 'string') {
    return null
  }
  return {
    fieldId: first.fieldId,
    keyword: String(first.value ?? ''),
  }
}

const toViewFilters = (filter: GridFilter | null) =>
  filter ? [{ fieldId: filter.fieldId, op: 'contains', value: filter.keyword }] : []

const readCascadeRules = (): CascadeRule[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(CASCADE_RULES_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as Array<Partial<CascadeRule>>
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((item) => !!item?.id && !!item?.parentFieldId && !!item?.childFieldId)
      .map((item, index) => ({
        id: String(item.id),
        name: item.name ? String(item.name) : `规则 ${index + 1}`,
        parentFieldId: String(item.parentFieldId),
        childFieldId: String(item.childFieldId),
        enabled: item.enabled ?? true,
        order: typeof item.order === 'number' ? item.order : index,
      }))
      .sort((a, b) => a.order - b.order)
  } catch {
    return []
  }
}

const writeCascadeRules = (rules: CascadeRule[]) => {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(CASCADE_RULES_KEY, JSON.stringify(rules))
}

const appendOperationLog = (item: Omit<OperationLogItem, 'id' | 'createdAt'>) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const toCompactLogValue = (value: unknown): unknown => {
      if (typeof value === 'string') {
        return value.length > 120 ? `${value.slice(0, 120)}...` : value
      }
      if (Array.isArray(value)) {
        const sliced = value.slice(0, 20).map(toCompactLogValue)
        return value.length > 20 ? [...sliced, '...'] : sliced
      }
      if (value && typeof value === 'object') {
        return '[object]'
      }
      return value
    }

    const compactFieldChanges = item.fieldChanges?.map((change) => ({
      ...change,
      oldValue: toCompactLogValue(change.oldValue),
      newValue: toCompactLogValue(change.newValue),
    }))
    const raw = window.localStorage.getItem(OPERATION_LOGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as OperationLogItem[]) : []
    const list = Array.isArray(parsed) ? parsed : []
    const nextItem: OperationLogItem = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...item,
      fieldChanges: compactFieldChanges,
    }
    const next = [nextItem, ...list].slice(0, 200)
    window.localStorage.setItem(OPERATION_LOGS_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(OPERATION_LOG_EVENT))
  } catch {
    // ignore log write failures
  }
}

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> => {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length)
  let cursor = 0

  const runOne = async () => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        const value = await worker(items[index], index)
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => runOne())
  await Promise.all(workers)
  return results
}

export const useGridStore = create<GridState>((set, get) => {
  let saveViewConfigTimer: ReturnType<typeof setTimeout> | null = null

  const scheduleSaveViewConfig = () => {
    if (saveViewConfigTimer) {
      clearTimeout(saveViewConfigTimer)
    }
    saveViewConfigTimer = setTimeout(async () => {
      const { activeViewId, viewConfig } = get()
      if (!activeViewId) {
        return
      }
      try {
        const updated = await gridApiClient.updateView(activeViewId, { config: viewConfig })
        set((state) => ({
          views: state.views.map((view) => (view.id === updated.id ? updated : view)),
        }))
      } catch (error) {
        set({ toast: getErrorMessage(error, '保存视图配置失败。') })
        setTimeout(() => set({ toast: null }), 1800)
      }
    }, 400)
  }

  const refreshRecords = async () => {
    const { activeTableId, activeViewId, viewConfig } = get()
    if (!activeTableId || !activeViewId) {
      return
    }
    try {
      const page = await gridApiClient.getRecords(activeTableId, activeViewId, undefined, MAX_CLIENT_RECORDS, {
        filters: viewConfig.filters,
        sorts: viewConfig.sorts,
        filterLogic: viewConfig.filterLogic ?? 'and',
      })
      set({
        records: page.items,
        totalRecords: page.totalCount,
        recordSnapshots: createRecordSnapshots(page.items),
      })
    } catch (error) {
      set({ toast: getErrorMessage(error, '刷新记录失败。') })
      setTimeout(() => set({ toast: null }), 1800)
    }
  }

  return ({
  activeTableId: null,
  activeViewId: null,
  fields: [],
  tableReferenceMembers: [],
  records: [],
  totalRecords: 0,
  recordSnapshots: {},
  selectedRecordIds: [],
  isAllRecordsSelected: false,
  views: [],
  cascadeRules: readCascadeRules(),
  focusedCell: null,
  editingCell: null,
  drawerRecordId: null,
  viewConfig: createDefaultViewConfig(),
  tableButtonPermissions: defaultTableButtonPermissions,
  filter: null,
  isLoading: true,
  toast: null,
  setData: (tableId, viewId, fields, tableReferenceMembers, records, views, viewConfig, totalRecords, tableButtonPermissions) => {
      const normalizedViewConfig: ViewConfig = {
        ...createDefaultViewConfig(),
        ...viewConfig,
        hiddenFieldIds: viewConfig.hiddenFieldIds ?? [],
        fieldOrderIds: viewConfig.fieldOrderIds ?? fields.map((field) => field.id),
        frozenFieldIds: viewConfig.frozenFieldIds ?? [],
        columnWidths: viewConfig.columnWidths ?? {},
        sorts: viewConfig.sorts ?? [],
        filters: viewConfig.filters ?? [],
      isEnabled: viewConfig.isEnabled ?? true,
      order: viewConfig.order ?? 0,
      filterLogic: viewConfig.filterLogic ?? 'and',
      filterPresets: viewConfig.filterPresets ?? [],
      compactEmptyRows: viewConfig.compactEmptyRows ?? false,
      components: viewConfig.components ?? {},
    }
    set((state) => {
      const inferred = inferCascadeRules(fields)
      const nextRules = state.cascadeRules.length > 0 ? state.cascadeRules : inferred
      if (state.cascadeRules.length === 0 && inferred.length > 0) {
        writeCascadeRules(inferred)
      }
      return {
        activeTableId: tableId,
        activeViewId: viewId,
        fields,
        tableReferenceMembers,
        records,
        totalRecords: totalRecords ?? records.length,
        recordSnapshots: createRecordSnapshots(records),
        views,
        viewConfig: normalizedViewConfig,
        tableButtonPermissions: tableButtonPermissions ?? state.tableButtonPermissions ?? defaultTableButtonPermissions,
        filter: toGridFilter(normalizedViewConfig),
        cascadeRules: nextRules,
        selectedRecordIds: [],
        isLoading: false,
      }
    })
  },
  setRecordsPage: (records, totalRecords) => {
    set((state) => ({
      records,
      totalRecords,
      recordSnapshots: createRecordSnapshots(records),
      selectedRecordIds: [],
      isAllRecordsSelected: false,
      drawerRecordId: state.drawerRecordId && records.some((item) => item.id === state.drawerRecordId) ? state.drawerRecordId : null,
      isLoading: false,
    }))
  },
  setFocusedCell: (cell) => {
    set({ focusedCell: cell })
  },
  setEditingCell: (cell) => {
    set({ editingCell: cell })
  },
  openDrawer: (recordId) => {
    set({ drawerRecordId: recordId })
  },
  closeDrawer: () => {
    set({ drawerRecordId: null })
  },
  upsertRecord: (record) => {
    set((state) => {
      const exists = state.records.some((item) => item.id === record.id)
      const nextRecords = exists
        ? state.records.map((item) => (item.id === record.id ? record : item))
        : [...state.records, record]
      return {
        records: nextRecords,
        recordSnapshots: {
          ...state.recordSnapshots,
          [record.id]: { ...record.values },
        },
      }
    })
  },
  updateCellLocal: (rowId, fieldId, value) => {
    set((state) => ({
      records: state.records.map((record) => {
        if (record.id !== rowId) {
          return record
        }
        return {
          ...record,
          values: {
            ...record.values,
            [fieldId]: value,
          },
        }
      }),
    }))
  },
  submitCellPatch: async (rowId, patch) => {
    try {
      const { activeTableId, fields, recordSnapshots, records } = get()
      const snapshotValues = recordSnapshots[rowId] ?? {}
      const currentRecord = records.find((item) => item.id === rowId)
      const fieldNameMap = new Map(fields.map((field) => [field.id, field.name]))
      const changedEntries = Object.entries(patch)
        .map(([fieldId, newValue]) => {
          const oldValue = normalizeValueForCompare(snapshotValues[fieldId] ?? null)
          const normalizedNew = normalizeValueForCompare(newValue)
          return {
            fieldId,
            fieldName: fieldNameMap.get(fieldId) ?? fieldId,
            oldValue,
            newValue: normalizedNew,
          }
        })
        .filter((item) => !isEqualValue(item.oldValue, item.newValue))
      if (changedEntries.length === 0) {
        return
      }
      const payload = Object.fromEntries(changedEntries.map((item) => [item.fieldId, item.newValue]))
      const updated = await gridApiClient.updateRecord(rowId, payload, currentRecord?.version ?? 0)
      set((state) => {
        return {
          records: state.records.map((record) => (record.id === rowId ? updated : record)),
          recordSnapshots: {
            ...state.recordSnapshots,
            [rowId]: { ...updated.values },
          },
        }
      })
      appendOperationLog({
        tableId: activeTableId ?? 'unknown',
        action: 'update_record',
        message: `更新记录 ${rowId}`,
        recordId: rowId,
        changedFields: changedEntries.map((item) => item.fieldId),
        fieldChanges: changedEntries,
      })
    } catch (error) {
      set({ toast: getErrorMessage(error, '保存失败，请重试。') })
      window.setTimeout(() => set({ toast: null }), 1800)
    }
  },
  createRecord: async (tableId, initialValues = {}) => {
    try {
      const created = await gridApiClient.createRecord(tableId, initialValues)
      set((state) => ({
        records: [created, ...state.records],
        totalRecords: state.totalRecords + 1,
        recordSnapshots: {
          ...state.recordSnapshots,
          [created.id]: { ...created.values },
        },
        toast: '已新增记录。',
      }))
      appendOperationLog({
        tableId,
        action: 'create_record',
        message: `新增记录 ${created.id}`,
        recordId: created.id,
      })
      window.setTimeout(() => set({ toast: null }), 1500)
    } catch (error) {
      set({ toast: getErrorMessage(error, '新增记录失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
    }
  },
  deleteRecord: async (recordId) => {
    try {
      const { activeTableId } = get()
      await gridApiClient.deleteRecord(recordId)
      set((state) => ({
        records: state.records.filter((record) => record.id !== recordId),
        totalRecords: Math.max(0, state.totalRecords - 1),
        recordSnapshots: Object.fromEntries(Object.entries(state.recordSnapshots).filter(([id]) => id !== recordId)),
        selectedRecordIds: state.selectedRecordIds.filter((id) => id !== recordId),
        drawerRecordId: state.drawerRecordId === recordId ? null : state.drawerRecordId,
        toast: '已删除记录。',
      }))
      appendOperationLog({
        tableId: activeTableId ?? 'unknown',
        action: 'delete_record',
        message: `删除记录 ${recordId}`,
        recordId,
      })
      window.setTimeout(() => set({ toast: null }), 1500)
    } catch (error) {
      set({ toast: getErrorMessage(error, '删除记录失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
    }
  },
  toggleRecordSelected: (recordId) => {
    set((state) => {
      if (state.isAllRecordsSelected) {
        const allIds = state.records.map((record) => record.id)
        return {
          isAllRecordsSelected: false,
          selectedRecordIds: allIds.filter((id) => id !== recordId),
        }
      }
      const exists = state.selectedRecordIds.includes(recordId)
      return {
        selectedRecordIds: exists
          ? state.selectedRecordIds.filter((id) => id !== recordId)
          : [...state.selectedRecordIds, recordId],
      }
    })
  },
  setRecordSelection: (recordIds, selected) => {
    if (recordIds.length === 0) {
      return
    }
    set((state) => {
      if (state.isAllRecordsSelected && selected) {
        return state
      }
      if (state.isAllRecordsSelected && !selected) {
        return { isAllRecordsSelected: false, selectedRecordIds: [] }
      }
      const next = new Set(state.selectedRecordIds)
      if (selected) {
        recordIds.forEach((id) => next.add(id))
      } else {
        recordIds.forEach((id) => next.delete(id))
      }
      return { selectedRecordIds: [...next], isAllRecordsSelected: false }
    })
  },
  clearSelectedRecords: () => {
    set({ selectedRecordIds: [], isAllRecordsSelected: false })
  },
  selectAllRecords: () => {
    set({ selectedRecordIds: [], isAllRecordsSelected: true })
  },
  deleteSelectedRecords: async () => {
    const { selectedRecordIds, activeTableId, isAllRecordsSelected, records } = get()
    const targetIds = isAllRecordsSelected ? records.map((record) => record.id) : selectedRecordIds
    if (targetIds.length === 0) {
      return
    }
    try {
      const results = await Promise.allSettled(
        targetIds.map((recordId) => gridApiClient.deleteRecord(recordId)),
      )
      const failedIds = targetIds.filter((_, index) => results[index]?.status === 'rejected')
      const successIds = targetIds.filter((id) => !failedIds.includes(id))
      set((state) => ({
        records: state.records.filter((record) => !successIds.includes(record.id)),
        totalRecords: Math.max(0, state.totalRecords - successIds.length),
        recordSnapshots: Object.fromEntries(
          Object.entries(state.recordSnapshots).filter(([id]) => !successIds.includes(id)),
        ),
        selectedRecordIds: failedIds,
        isAllRecordsSelected: failedIds.length === 0 ? false : state.isAllRecordsSelected,
        drawerRecordId:
          state.drawerRecordId && successIds.includes(state.drawerRecordId) ? null : state.drawerRecordId,
        toast:
          failedIds.length === 0
            ? `已删除 ${successIds.length} 条记录。`
            : `删除完成：成功 ${successIds.length} 条，失败 ${failedIds.length} 条。`,
      }))
      appendOperationLog({
        tableId: activeTableId ?? 'unknown',
        action: 'delete_record',
        message:
          failedIds.length === 0
            ? `批量删除 ${successIds.length} 条记录`
            : `批量删除：成功 ${successIds.length} 条，失败 ${failedIds.length} 条`,
        count: successIds.length,
      })
      window.setTimeout(() => set({ toast: null }), 1800)
    } catch (error) {
      set({ toast: getErrorMessage(error, '批量删除记录失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
    }
  },
  createField: async (tableId, name, type, options) => {
    try {
      const created = await gridApiClient.createField(tableId, name, type, options)
      set((state) => ({
        fields: [...state.fields, created],
        records: state.records.map((record) => ({
          ...record,
          values: {
            ...record.values,
            [created.id]: null,
          },
        })),
        recordSnapshots: Object.fromEntries(
          Object.entries(state.recordSnapshots).map(([id, values]) => [
            id,
            {
              ...values,
              [created.id]: null,
            },
          ]),
        ),
        viewConfig: {
          ...state.viewConfig,
          fieldOrderIds: [...(state.viewConfig.fieldOrderIds ?? []), created.id],
          columnWidths: {
            ...state.viewConfig.columnWidths,
            [created.id]: created.width ?? 180,
          },
        },
        toast: '已新增字段。',
      }))
      scheduleSaveViewConfig()
      window.setTimeout(() => set({ toast: null }), 1500)
      return created
    } catch (error) {
      set({ toast: getErrorMessage(error, '新增字段失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  createFieldForView: async (tableId, viewId, name, type, options) => {
    try {
      const created = await gridApiClient.createField(tableId, name, type, options)
      const { views, activeViewId } = get()
      const sameTableViews = views.filter((view) => view.tableId === tableId)
      const updatedViews = await Promise.all(
        sameTableViews.map((view) => {
          const hidden = new Set(view.config.hiddenFieldIds ?? [])
          if (view.id === viewId) {
            hidden.delete(created.id)
          } else {
            hidden.add(created.id)
          }
          return gridApiClient.updateView(view.id, {
            config: {
              ...view.config,
              fieldOrderIds: [...(view.config.fieldOrderIds ?? []), created.id],
              hiddenFieldIds: [...hidden],
              columnWidths: {
                ...view.config.columnWidths,
                [created.id]: created.width ?? 180,
              },
            },
          })
        })
      )
      const updatedMap = new Map(updatedViews.map((view) => [view.id, view]))
      set((state) => {
        const nextViews = state.views.map((view) => updatedMap.get(view.id) ?? view)
        const activeView = activeViewId ? updatedMap.get(activeViewId) : null
        return {
          fields: [...state.fields, created],
          records: state.records.map((record) => ({
            ...record,
            values: {
              ...record.values,
              [created.id]: null,
            },
          })),
          recordSnapshots: Object.fromEntries(
            Object.entries(state.recordSnapshots).map(([id, values]) => [
              id,
              {
                ...values,
                [created.id]: null,
              },
            ]),
          ),
          views: nextViews,
          viewConfig: activeView ? activeView.config : state.viewConfig,
          toast: '已新增字段，并绑定到目标视图。',
        }
      })
      window.setTimeout(() => set({ toast: null }), 1600)
      return created
    } catch (error) {
      set({ toast: getErrorMessage(error, '新增字段失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  addFieldToView: async (viewId, fieldId) => {
    try {
      const { views, activeViewId } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const updated = await gridApiClient.updateView(viewId, {
        config: {
          ...target.config,
          fieldOrderIds: target.config.fieldOrderIds?.includes(fieldId)
            ? target.config.fieldOrderIds
            : [...(target.config.fieldOrderIds ?? []), fieldId],
          hiddenFieldIds: (target.config.hiddenFieldIds ?? []).filter((id) => id !== fieldId),
        },
      })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
        viewConfig: activeViewId === viewId ? updated.config : state.viewConfig,
        toast: '字段已添加到该视图。',
      }))
      window.setTimeout(() => set({ toast: null }), 1400)
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '添加字段到视图失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  removeFieldFromView: async (viewId, fieldId) => {
    try {
      const { views, activeViewId } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const hiddenSet = new Set(target.config.hiddenFieldIds ?? [])
      hiddenSet.add(fieldId)
      const updated = await gridApiClient.updateView(viewId, {
        config: {
          ...target.config,
          hiddenFieldIds: [...hiddenSet],
          frozenFieldIds: (target.config.frozenFieldIds ?? []).filter((id) => id !== fieldId),
        },
      })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
        viewConfig: activeViewId === viewId ? updated.config : state.viewConfig,
        toast: '字段已从该视图移除。',
      }))
      window.setTimeout(() => set({ toast: null }), 1400)
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '从视图移除字段失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  moveFieldInView: async (viewId, fieldId, direction) => {
    try {
      const { views, activeViewId, fields } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const tableFieldIds = fields
        .filter((field) => field.tableId === target.tableId)
        .map((field) => field.id)
      const existingOrder = target.config.fieldOrderIds ?? []
      const merged = [
        ...existingOrder.filter((id) => tableFieldIds.includes(id)),
        ...tableFieldIds.filter((id) => !existingOrder.includes(id)),
      ]
      const idx = merged.findIndex((id) => id === fieldId)
      if (idx < 0) {
        return target
      }
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1
      if (nextIdx < 0 || nextIdx >= merged.length) {
        return target
      }
      ;[merged[idx], merged[nextIdx]] = [merged[nextIdx], merged[idx]]
      const updated = await gridApiClient.updateView(viewId, {
        config: {
          ...target.config,
          fieldOrderIds: merged,
        },
      })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
        viewConfig: activeViewId === viewId ? updated.config : state.viewConfig,
      }))
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '调整字段顺序失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  setFieldOrderInView: async (viewId, fieldOrderIds) => {
    try {
      const { views, activeViewId, fields } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const tableFieldIds = fields.filter((field) => field.tableId === target.tableId).map((field) => field.id)
      const normalized = [
        ...fieldOrderIds.filter((id) => tableFieldIds.includes(id)),
        ...tableFieldIds.filter((id) => !fieldOrderIds.includes(id)),
      ]
      const updated = await gridApiClient.updateView(viewId, {
        config: {
          ...target.config,
          fieldOrderIds: normalized,
        },
      })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
        viewConfig: activeViewId === viewId ? updated.config : state.viewConfig,
      }))
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '保存字段顺序失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  deleteField: async (fieldId) => {
    try {
      await gridApiClient.deleteField(fieldId)
      set((state) => {
        const nextColumnWidths = { ...state.viewConfig.columnWidths }
        delete nextColumnWidths[fieldId]
        return {
          fields: state.fields.filter((field) => field.id !== fieldId),
          records: state.records.map((record) => {
            const nextValues = { ...record.values }
            delete nextValues[fieldId]
            return { ...record, values: nextValues }
          }),
          recordSnapshots: Object.fromEntries(
            Object.entries(state.recordSnapshots).map(([id, values]) => {
              const nextValues = { ...values }
              delete nextValues[fieldId]
              return [id, nextValues]
            }),
          ),
          focusedCell: state.focusedCell?.fieldId === fieldId ? null : state.focusedCell,
          editingCell: state.editingCell?.fieldId === fieldId ? null : state.editingCell,
          viewConfig: {
            ...state.viewConfig,
            hiddenFieldIds: state.viewConfig.hiddenFieldIds.filter((id) => id !== fieldId),
            frozenFieldIds: (state.viewConfig.frozenFieldIds ?? []).filter((id) => id !== fieldId),
            columnWidths: nextColumnWidths,
          },
          filter: state.filter?.fieldId === fieldId ? null : state.filter,
          toast: '已删除字段。',
        }
      })
      scheduleSaveViewConfig()
      window.setTimeout(() => set({ toast: null }), 1500)
    } catch (error) {
      set({ toast: getErrorMessage(error, '删除字段失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
    }
  },
  importRecords: async (tableId, recordValuesList) => {
    try {
      if (recordValuesList.length === 0) {
        throw new Error('没有可导入的数据。')
      }
      let successCount = 0
      let failedCount = 0
      const failureMessages: string[] = []
      const total = recordValuesList.length

      for (let offset = 0; offset < total; offset += IMPORT_BATCH_SIZE) {
        const batch = recordValuesList.slice(offset, offset + IMPORT_BATCH_SIZE)
        const settled = await runWithConcurrency(batch, IMPORT_CONCURRENCY, (values) =>
          gridApiClient.createRecord(tableId, values.values),
        )
        const createdRecords: RecordModel[] = []
        settled.forEach((item, index) => {
          if (item.status === 'fulfilled') {
            createdRecords.push(item.value)
            return
          }
          const rowNumber = batch[index]?.rowNumber ?? offset + index + 2
          failureMessages.push(`第 ${rowNumber} 行：${getErrorMessage(item.reason, '导入失败。')}`)
        })
        const currentFailed = settled.length - createdRecords.length
        successCount += createdRecords.length
        failedCount += currentFailed

        if (createdRecords.length > 0) {
          set((state) => {
            const merged = [...state.records, ...createdRecords]
            const nextRecords = merged.slice(Math.max(0, merged.length - MAX_CLIENT_RECORDS))
            return {
              records: nextRecords,
              totalRecords: state.totalRecords + createdRecords.length,
              recordSnapshots: createRecordSnapshots(nextRecords),
              toast: `导入中：${Math.min(offset + batch.length, total)} / ${total}`,
            }
          })
        } else {
          set({
            toast: `导入中：${Math.min(offset + batch.length, total)} / ${total}`,
          })
        }

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0)
        })
      }

      const uniqueFailureMessages = dedupeMessages(failureMessages)
      if (successCount === 0) {
        throw new Error(formatImportFailureSummary(uniqueFailureMessages, failedCount))
      }
      set({
        toast:
          failedCount > 0
            ? `导入完成：成功 ${successCount} 条，失败 ${failedCount} 条。${formatImportFailureSummary(uniqueFailureMessages, failedCount)}`
            : `已成功导入 ${successCount} 条记录。`,
      })
      appendOperationLog({
        tableId,
        action: 'import_records',
        message:
          failedCount > 0
            ? `导入：成功 ${successCount} 条，失败 ${failedCount} 条`
            : `导入 ${successCount} 条记录`,
        count: successCount,
      })
      window.setTimeout(() => set({ toast: null }), 2000)
      return {
        successCount,
        failedCount,
        failureMessages: uniqueFailureMessages,
      }
    } catch (error) {
      const message = getErrorMessage(error, '导入记录失败。')
      set({ toast: message })
      window.setTimeout(() => set({ toast: null }), 2400)
      throw error instanceof Error ? error : new Error(message)
    }
  },
  createView: async (tableId, name, type, initialConfig, options) => {
    try {
      let created = await gridApiClient.createView(tableId, name, type, options)
      if (initialConfig) {
        created = await gridApiClient.updateView(created.id, {
          config: {
            ...created.config,
            ...initialConfig,
            formSettings: initialConfig.formSettings
              ? {
                  ...(created.config.formSettings ?? {}),
                  ...initialConfig.formSettings,
                }
              : created.config.formSettings,
          },
        })
      }
      set((state) => {
        // Initialize form view with all fields visible by default
        if (type === 'form' && !initialConfig?.formSettings) {
          created.config = {
            ...created.config,
            formSettings: {
              visibleFieldIds: state.fields.map((f) => f.id),
              fieldConfig: {},
            },
          }
        }
        return {
          views: [...state.views, created],
          toast: '已创建视图。',
        }
      })

      window.setTimeout(() => set({ toast: null }), 1500)
      return created
    } catch (error) {
      set({ toast: getErrorMessage(error, '创建视图失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  deleteView: async (viewId) => {
    try {
      const { views, activeViewId } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const sameTableViews = views.filter((view) => view.tableId === target.tableId)
      if (sameTableViews.length <= 1) {
        set({ toast: '至少保留一个视图，不能删除最后一个视图。' })
        window.setTimeout(() => set({ toast: null }), 2000)
        return null
      }

      await gridApiClient.deleteView(viewId)

      const remaining = sameTableViews.filter((view) => view.id !== viewId)
      const preferred = remaining.find((view) => view.config.isEnabled !== false) ?? remaining[0]
      const nextViewId = preferred?.id ?? null
      const nextView = preferred
      set((state) => ({
        views: state.views.filter((view) => view.id !== viewId),
        activeViewId: activeViewId === viewId ? nextViewId : state.activeViewId,
        viewConfig: activeViewId === viewId && nextView ? nextView.config : state.viewConfig,
        toast: '已删除视图。',
      }))
      window.setTimeout(() => set({ toast: null }), 1500)
      return nextViewId
    } catch (error) {
      set({ toast: getErrorMessage(error, '删除视图失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  setViewEnabled: async (viewId, enabled) => {
    try {
      const { views, activeViewId } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        set({ toast: '视图不存在。' })
        window.setTimeout(() => set({ toast: null }), 1800)
        return null
      }
      const updated = await gridApiClient.updateView(viewId, {
        config: {
          ...target.config,
          isEnabled: enabled,
        },
      })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
        viewConfig: activeViewId === viewId ? updated.config : state.viewConfig,
      }))
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '更新视图启用状态失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  renameView: async (viewId, name) => {
    const nextName = name.trim()
    if (!nextName) {
      set({ toast: '视图名称不能为空。' })
      window.setTimeout(() => set({ toast: null }), 1500)
      return null
    }
    try {
      const updated = await gridApiClient.updateView(viewId, { name: nextName })
      set((state) => ({
        views: state.views.map((view) => (view.id === viewId ? updated : view)),
      }))
      return updated
    } catch (error) {
      set({ toast: getErrorMessage(error, '重命名视图失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return null
    }
  },
  moveView: async (viewId, direction) => {
    try {
      const { views } = get()
      const target = views.find((view) => view.id === viewId)
      if (!target) {
        return false
      }
      const sameTableViews = [...views]
        .filter((view) => view.tableId === target.tableId)
        .sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0))
      const idx = sameTableViews.findIndex((view) => view.id === viewId)
      if (idx < 0) {
        return false
      }
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= sameTableViews.length) {
        return false
      }
      const current = sameTableViews[idx]
      const neighbor = sameTableViews[targetIdx]
      const currentOrder = current.config.order ?? idx
      const neighborOrder = neighbor.config.order ?? targetIdx

      const [updatedCurrent, updatedNeighbor] = await Promise.all([
        gridApiClient.updateView(current.id, {
          config: { ...current.config, order: neighborOrder },
        }),
        gridApiClient.updateView(neighbor.id, {
          config: { ...neighbor.config, order: currentOrder },
        }),
      ])
      set((state) => {
        const merged = state.views.map((view) => {
          if (view.id === updatedCurrent.id) return updatedCurrent
          if (view.id === updatedNeighbor.id) return updatedNeighbor
          return view
        })
        merged.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0))
        return { views: merged }
      })
      return true
    } catch (error) {
      set({ toast: getErrorMessage(error, '调整视图顺序失败。') })
      window.setTimeout(() => set({ toast: null }), 1800)
      return false
    }
  },
  refreshRecords,
  setCascadeRule: (rule) => {
    set((state) => {
      const nextRules = state.cascadeRules.some((item) => item.id === rule.id)
        ? state.cascadeRules.map((item) => (item.id === rule.id ? rule : item))
        : [...state.cascadeRules, rule]
      writeCascadeRules(nextRules)
      return { cascadeRules: nextRules }
    })
  },
  removeCascadeRule: (ruleId) => {
    set((state) => {
      const nextRules = state.cascadeRules
        .filter((item) => item.id !== ruleId)
        .map((item, index) => ({ ...item, order: index }))
      writeCascadeRules(nextRules)
      return { cascadeRules: nextRules }
    })
  },
  moveCascadeRule: (ruleId, direction) => {
    set((state) => {
      const sorted = [...state.cascadeRules].sort((a, b) => a.order - b.order)
      const idx = sorted.findIndex((item) => item.id === ruleId)
      if (idx < 0) {
        return { cascadeRules: state.cascadeRules }
      }
      const target = direction === 'up' ? idx - 1 : idx + 1
      if (target < 0 || target >= sorted.length) {
        return { cascadeRules: state.cascadeRules }
      }
      ;[sorted[idx], sorted[target]] = [sorted[target], sorted[idx]]
      const nextRules = sorted.map((item, index) => ({ ...item, order: index }))
      writeCascadeRules(nextRules)
      return { cascadeRules: nextRules }
    })
  },
  setFilter: (filter) => {
    set((state) => ({
      filter,
      viewConfig: {
        ...state.viewConfig,
        filters: toViewFilters(filter),
      },
    }))
    scheduleSaveViewConfig()
  },
  setColumnWidth: (fieldId, width) => {
    set((state) => ({
      viewConfig: {
        ...state.viewConfig,
        columnWidths: {
          ...state.viewConfig.columnWidths,
          [fieldId]: width,
        },
      },
    }))
    scheduleSaveViewConfig()
  },
  setHiddenFields: (fieldIds) => {
    set((state) => ({
      viewConfig: {
        ...state.viewConfig,
        hiddenFieldIds: fieldIds,
        frozenFieldIds: (state.viewConfig.frozenFieldIds ?? []).filter((id) => !fieldIds.includes(id)),
      },
    }))
    scheduleSaveViewConfig()
  },
  updateViewConfig: (config) => {
    const shouldRefreshRecords =
      config.filters !== undefined || config.sorts !== undefined || config.filterLogic !== undefined
    set((state) => {
      const nextViewConfig = { ...state.viewConfig, ...config }
      if (config.hiddenFieldIds) {
        const hiddenSet = new Set(config.hiddenFieldIds)
        nextViewConfig.frozenFieldIds = (nextViewConfig.frozenFieldIds ?? []).filter((id) => !hiddenSet.has(id))
      }
      return {
        viewConfig: nextViewConfig,
        filter: toGridFilter(nextViewConfig),
      }
    })
    scheduleSaveViewConfig()
    if (shouldRefreshRecords) {
      // Records are loaded page-by-page in GridView.
    }
  },
  setToast: (message, level) => {
    void level
    set({ toast: message })
  },
  setLoading: (loading) => {
    set({ isLoading: loading })
  },
})
})
