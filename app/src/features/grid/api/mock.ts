import { createApiClient } from './client'
import type { Field, RecordModel, TableButtonPermissions, View, ViewConfig } from '../types/grid'

const DEFAULT_VIEW_CONFIG: ViewConfig = {
  hiddenFieldIds: [],
  fieldOrderIds: [],
  columnWidths: {},
  sorts: [],
  filters: [],
  isEnabled: true,
  order: 0,
  filterLogic: 'and',
  filterPresets: [],
  components: {},
}

const mockFields: Field[] = [
  { id: 'fld_name', tableId: 'tbl_1', name: '名称', type: 'text', width: 260 },
  { id: 'fld_owner', tableId: 'tbl_1', name: '负责人', type: 'text', width: 180 },
  { id: 'fld_score', tableId: 'tbl_1', name: '分数', type: 'number', width: 120 },
  { id: 'fld_due', tableId: 'tbl_1', name: '截止日期', type: 'date', width: 170 },
  {
    id: 'fld_status',
    tableId: 'tbl_1',
    name: '状态',
    type: 'singleSelect',
    width: 180,
    options: [
      { id: '待处理', name: '待处理', color: '#9ca3af' },
      { id: '进行中', name: '进行中', color: '#3b82f6' },
      { id: '已完成', name: '已完成', color: '#10b981' },
    ],
  },
]

const mockViews: View[] = [
  {
    id: 'viw_1',
    tableId: 'tbl_1',
    name: '表格',
    type: 'grid',
    config: {
      ...DEFAULT_VIEW_CONFIG,
      columnWidths: {
        fld_name: 260,
        fld_owner: 180,
        fld_score: 120,
        fld_due: 170,
        fld_status: 180,
      },
    },
  },
  {
    id: 'viw_kanban_1',
    tableId: 'tbl_1',
    name: '看板',
    type: 'kanban',
    config: {
      ...DEFAULT_VIEW_CONFIG,
      order: 1,
    },
  },
]

const owners = ['张明', '王芳', '李浩', '陈雪', '周杰', '林娜', '赵宇']
const statuses = ['待处理', '进行中', '已完成']

const mockRecords: RecordModel[] = Array.from({ length: 2000 }, (_, i) => {
  const idx = i + 1
  return {
    id: `rec_${idx}`,
    tableId: 'tbl_1',
    version: 0,
    values: {
      fld_name: `任务 ${idx}`,
      fld_owner: owners[i % owners.length],
      fld_score: ((i * 7) % 100) + 1,
      fld_due: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      fld_status: statuses[i % statuses.length],
    },
  }
})

const recordsById = new Map(mockRecords.map((record) => [record.id, record]))
let dynamicFieldSeq = 1
const mockReferenceMembers = [
  { userId: 'usr_owner', username: 'owner' },
  { userId: 'usr_member_1', username: '张明' },
  { userId: 'usr_member_2', username: '王芳' },
]
let mockTablePermissions = [
  { userId: 'usr_owner', username: 'owner', canRead: true, canWrite: true },
  { userId: 'usr_member_1', username: '张明', canRead: true, canWrite: false },
]
const viewPermissionMap: Record<string, Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>> = {
  viw_1: [...mockTablePermissions],
}
const DEFAULT_BUTTON_PERMISSIONS: TableButtonPermissions = {
  canCreateRecord: true,
  canDeleteRecord: true,
  canImportRecords: true,
  canExportRecords: true,
  canManageFilters: true,
  canManageSorts: true,
}
const mockTableButtonPermissions: Record<string, TableButtonPermissions> = {
  usr_owner: { ...DEFAULT_BUTTON_PERMISSIONS },
  usr_member_1: { ...DEFAULT_BUTTON_PERMISSIONS },
}
let mockWorkflowConfig: {
  tableId: string
  statusFieldId: string | null
  allowAnyTransition: boolean
  finalStatusOptionIds: string[]
  statusOptions: Array<{ id: string; name: string; color?: string; parentId?: string }>
} = {
  tableId: 'tbl_1',
  statusFieldId: 'fld_status',
  allowAnyTransition: false,
  finalStatusOptionIds: ['已完成'],
  statusOptions: mockFields.find((field) => field.id === 'fld_status')?.options ?? [],
}
let mockWorkflowTransitions: Array<{ fromOptionId: string; toOptionId: string }> = [
  { fromOptionId: '待处理', toOptionId: '进行中' },
  { fromOptionId: '待处理', toOptionId: '已完成' },
  { fromOptionId: '进行中', toOptionId: '待处理' },
  { fromOptionId: '进行中', toOptionId: '已完成' },
  { fromOptionId: '已完成', toOptionId: '待处理' },
]
let mockStatusLogSeq = 1
const mockStatusLogs: Array<{
  id: number
  recordId: string
  tableId: string
  statusFieldId: string | null
  fromOptionId: string | null
  toOptionId: string
  operatorUserId: string | null
  operatorUsername: string | null
  source: string
  createdAt: string
}> = []
const mockViewTabs: Record<
  string,
  Array<{
    id: string
    viewId: string
    tableId: string
    name: string
    visibility: 'personal' | 'shared'
    ownerUserId: string | null
    isSystemPreset: boolean
    sortOrder: number
    payload: { filterLogic: 'and' | 'or'; filters: Array<{ fieldId: string; op: string; value: unknown }>; sorts: Array<{ fieldId: string; direction: 'asc' | 'desc' }> }
  }>
> = {}

const delay = <T,>(value: T, ms = 120) =>
  new Promise<T>((resolve) => {
    window.setTimeout(() => resolve(value), ms)
  })

const applyFilter = (record: RecordModel, filter: { fieldId: string; op: string; value: unknown }) => {
  const value = record.values[filter.fieldId]
  const op = (filter.op || 'contains').toLowerCase()
  if (op === 'in' && Array.isArray(filter.value)) {
    return filter.value.includes(value)
  }
  if (op === 'nin' && Array.isArray(filter.value)) {
    return !filter.value.includes(value)
  }
  if (op === 'contains') {
    return String(value ?? '')
      .toLowerCase()
      .includes(String(filter.value ?? '').toLowerCase())
  }
  if (op === 'eq' || op === 'equals') {
    return value === filter.value
  }
  if (op === 'neq') {
    return value !== filter.value
  }
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    if (typeof value === 'string' && typeof filter.value === 'string') {
      if (op === 'gt') return value > filter.value
      if (op === 'gte') return value >= filter.value
      if (op === 'lt') return value < filter.value
      return value <= filter.value
    }
    const left = typeof value === 'number' ? value : Number(value)
    const right = typeof filter.value === 'number' ? filter.value : Number(filter.value)
    if (Number.isNaN(left) || Number.isNaN(right)) return false
    if (op === 'gt') return left > right
    if (op === 'gte') return left >= right
    if (op === 'lt') return left < right
    return left <= right
  }
  return String(value ?? '')
    .toLowerCase()
    .includes(String(filter.value ?? '').toLowerCase())
}

const applyFilters = (
  records: RecordModel[],
  filters: Array<{ fieldId: string; op: string; value: unknown }>,
  filterLogic: 'and' | 'or'
) => {
  if (filters.length === 0) {
    return records
  }
  if (filterLogic === 'or') {
    return records.filter((record) => filters.some((filter) => applyFilter(record, filter)))
  }
  return records.filter((record) => filters.every((filter) => applyFilter(record, filter)))
}

const applySorts = (records: RecordModel[], sorts: Array<{ fieldId: string; direction: 'asc' | 'desc' }>) => {
  let next = [...records]
  for (const sort of [...sorts].reverse()) {
    const reverse = sort.direction === 'desc'
    next = next.sort((a, b) => {
      const av = a.values[sort.fieldId]
      const bv = b.values[sort.fieldId]
      if (av == null && bv == null) return 0
      if (av == null) return reverse ? -1 : 1
      if (bv == null) return reverse ? 1 : -1
      if (av === bv) return 0
      if (typeof av === 'number' && typeof bv === 'number') {
        return reverse ? bv - av : av - bv
      }
      return reverse
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv))
    })
  }
  return next
}

export const mockGridApi = createApiClient({
  async getFields(tableId) {
    return delay(mockFields.filter((field) => field.tableId === tableId))
  },
  async getViews(tableId) {
    return delay(mockViews.filter((view) => view.tableId === tableId))
  },
  async importViewBundle(tableId, payload) {
    const viewId = `viw_${mockViews.length + 1}`
    const sameTableViews = mockViews.filter((view) => view.tableId === tableId)
    const nextOrder =
      sameTableViews.length === 0
        ? 0
        : Math.max(...sameTableViews.map((view) => view.config.order ?? 0)) + 1
    const createdView: View = {
      id: viewId,
      tableId,
      name: payload.viewName,
      type: payload.viewType ?? 'grid',
      config: { ...DEFAULT_VIEW_CONFIG, order: nextOrder },
    }
    mockViews.push(createdView)

    const fieldIds: string[] = []
    const headerToFieldId = new Map<string, string>()
    for (const field of payload.fields) {
      const id = `fld_dynamic_${dynamicFieldSeq++}`
      const createdField: Field = {
        id,
        tableId,
        name: field.name,
        type: field.type ?? 'text',
        width: field.width ?? 180,
        options: field.options && field.options.length > 0 ? field.options : undefined,
      }
      mockFields.push(createdField)
      fieldIds.push(id)
      headerToFieldId.set(field.name, id)
    }

    for (const row of payload.records) {
      const recordId = `rec_${mockRecords.length + 1}`
      const values: Record<string, unknown> = {}
      for (const field of payload.fields) {
        const fieldId = headerToFieldId.get(field.name)
        if (!fieldId) continue
        values[fieldId] = row[field.name] ?? null
      }
      const createdRecord: RecordModel = {
        id: recordId,
        tableId,
        version: 0,
        values,
      }
      mockRecords.push(createdRecord)
      recordsById.set(recordId, createdRecord)
    }

    return delay({
      viewId: createdView.id,
      viewName: createdView.name,
      fieldIds,
      recordCount: payload.records.length,
    })
  },
  async getRecords(tableId, _viewId, cursor, pageSize = 100, query) {
    let items = mockRecords.filter((record) => record.tableId === tableId)
    if (query?.filters?.length) {
      items = applyFilters(items, query.filters, query.filterLogic ?? 'and')
    }
    if (query?.sorts?.length) {
      items = applySorts(items, query.sorts)
    }
    const start = Math.max(0, Number(cursor ?? 0) || 0)
    const safePageSize = Math.max(1, Math.min(pageSize, 500))
    const pageItems = items.slice(start, start + safePageSize)
    const nextCursor = start + safePageSize < items.length ? String(start + safePageSize) : null
    return delay(
      {
        items: pageItems,
        nextCursor,
        totalCount: items.length,
      },
      180,
    )
  },
  async updateRecord(recordId, valuesPatch) {
    const existing = recordsById.get(recordId)
    if (!existing) {
      throw new Error('记录不存在')
    }
    const updated: RecordModel = {
      ...existing,
      version: (existing.version ?? 0) + 1,
      values: {
        ...existing.values,
        ...valuesPatch,
      },
    }
    recordsById.set(recordId, updated)
    const recordIndex = mockRecords.findIndex((record) => record.id === recordId)
    if (recordIndex >= 0) {
      mockRecords[recordIndex] = updated
    }
    return delay(updated)
  },
  async createRecord(tableId, initialValues = {}) {
    const nextId = `rec_${mockRecords.length + 1}`
    const created: RecordModel = {
      id: nextId,
      tableId,
      version: 0,
      values: initialValues,
    }
    mockRecords.unshift(created)
    recordsById.set(nextId, created)
    return delay(created)
  },
  async deleteRecord(recordId) {
    recordsById.delete(recordId)
    const recordIndex = mockRecords.findIndex((record) => record.id === recordId)
    if (recordIndex >= 0) {
      mockRecords.splice(recordIndex, 1)
    }
    return delay(undefined)
  },
  async createField(tableId, name, type, options) {
    const id = `fld_dynamic_${dynamicFieldSeq++}`
    const created: Field = {
      id,
      tableId,
      name,
      type,
      width: 180,
      options: options && options.length > 0 ? options : undefined,
    }
    mockFields.push(created)
    for (const record of mockRecords) {
      if (record.tableId === tableId) {
        record.values[id] = null
      }
    }
    return delay(created)
  },
  async deleteField(fieldId) {
    const fieldIndex = mockFields.findIndex((field) => field.id === fieldId)
    if (fieldIndex >= 0) {
      mockFields.splice(fieldIndex, 1)
    }
    for (const record of mockRecords) {
      if (Object.prototype.hasOwnProperty.call(record.values, fieldId)) {
        delete record.values[fieldId]
      }
    }
    return delay(undefined)
  },
  async createView(tableId, name, type) {
    const id = `viw_${mockViews.length + 1}`
    const sameTableViews = mockViews.filter((view) => view.tableId === tableId)
    const nextOrder =
      sameTableViews.length === 0
        ? 0
        : Math.max(...sameTableViews.map((view) => view.config.order ?? 0)) + 1
    const created: View = {
      id,
      tableId,
      name,
      type,
      config: { ...DEFAULT_VIEW_CONFIG, order: nextOrder },
    }
    mockViews.push(created)
    return delay(created)
  },
  async deleteView(viewId) {
    const target = mockViews.find((view) => view.id === viewId)
    if (!target) {
      throw new Error('视图不存在')
    }
    const sameTableViews = mockViews.filter((view) => view.tableId === target.tableId)
    if (sameTableViews.length <= 1) {
      throw new Error('至少保留一个视图，不能删除最后一个视图')
    }
    const index = mockViews.findIndex((view) => view.id === viewId)
    if (index >= 0) {
      mockViews.splice(index, 1)
    }
    return delay(undefined)
  },
  async updateView(viewId, patch) {
    const existing = mockViews.find((view) => view.id === viewId)
    if (!existing) {
      throw new Error('视图不存在')
    }
    const updated: View = {
      ...existing,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {}),
    }
    const index = mockViews.findIndex((view) => view.id === viewId)
    mockViews[index] = updated
    return delay(updated)
  },
  async getTablePermissions(tableId) {
    if (!tableId) return delay([])
    return delay(mockTablePermissions)
  },
  async updateTablePermissions(tableId, items) {
    if (!tableId) return delay([])
    mockTablePermissions = items.map((item) => {
      const member = mockReferenceMembers.find((ref) => ref.userId === item.userId)
      return {
        userId: item.userId,
        username: member?.username ?? item.userId,
        canRead: item.canRead,
        canWrite: item.canWrite,
      }
    })
    return delay(mockTablePermissions)
  },
  async applyTablePermissionsByRoleDefaults(tableId) {
    if (!tableId) return delay([])
    return delay(mockTablePermissions)
  },
  async getTableButtonPermissions(tableId) {
    if (!tableId) return delay([])
    return delay(
      mockTablePermissions.map((item) => ({
        userId: item.userId,
        username: item.username,
        buttons: mockTableButtonPermissions[item.userId] ?? { ...DEFAULT_BUTTON_PERMISSIONS },
      })),
    )
  },
  async updateTableButtonPermissions(tableId, items) {
    if (!tableId) return delay([])
    items.forEach((item) => {
      mockTableButtonPermissions[item.userId] = { ...item.buttons }
    })
    return delay(
      mockTablePermissions.map((item) => ({
        userId: item.userId,
        username: item.username,
        buttons: mockTableButtonPermissions[item.userId] ?? { ...DEFAULT_BUTTON_PERMISSIONS },
      })),
    )
  },
  async getMyTableButtonPermissions(tableId) {
    if (!tableId) return delay({ ...DEFAULT_BUTTON_PERMISSIONS })
    return delay({ ...DEFAULT_BUTTON_PERMISSIONS })
  },
  async getViewPermissions(viewId) {
    return delay(viewPermissionMap[viewId] ?? [])
  },
  async updateViewPermissions(viewId, items) {
    viewPermissionMap[viewId] = items.map((item) => {
      const member = mockReferenceMembers.find((ref) => ref.userId === item.userId)
      return {
        userId: item.userId,
        username: member?.username ?? item.userId,
        canRead: item.canRead,
        canWrite: item.canWrite,
      }
    })
    return delay(viewPermissionMap[viewId])
  },
  async applyViewPermissionsByRoleDefaults(viewId) {
    if (!viewPermissionMap[viewId]) {
      viewPermissionMap[viewId] = [...mockTablePermissions]
    }
    return delay(viewPermissionMap[viewId])
  },
  async getTableReferenceMembers(tableId) {
    if (!tableId) return delay([])
    const ids = new Set(
      mockTablePermissions
        .filter((item) => item.canRead || item.canWrite)
        .map((item) => item.userId),
    )
    return delay(mockReferenceMembers.filter((item) => ids.has(item.userId)))
  },
  async getWorkflowConfig(_tableId) {
    return delay({
      ...mockWorkflowConfig,
      statusOptions: [...(mockFields.find((item) => item.id === mockWorkflowConfig.statusFieldId)?.options ?? [])],
    })
  },
  async updateWorkflowConfig(tableId, payload) {
    const statusField = mockFields.find((item) => item.id === payload.statusFieldId)
    mockWorkflowConfig = {
      tableId,
      statusFieldId: payload.statusFieldId,
      allowAnyTransition: payload.allowAnyTransition,
      finalStatusOptionIds: [...payload.finalStatusOptionIds],
      statusOptions: statusField?.options ?? [],
    }
    return delay({
      ...mockWorkflowConfig,
      statusOptions: [...mockWorkflowConfig.statusOptions],
    })
  },
  async getWorkflowTransitions(_tableId) {
    return delay([...mockWorkflowTransitions])
  },
  async updateWorkflowTransitions(_tableId, payload) {
    mockWorkflowTransitions = payload.flatMap((item) =>
      item.toOptionIds.map((toOptionId) => ({ fromOptionId: item.fromOptionId, toOptionId })),
    )
    return delay([...mockWorkflowTransitions])
  },
  async transitionRecordStatus(recordId, payload) {
    const record = recordsById.get(recordId)
    if (!record) {
      throw new Error('记录不存在')
    }
    const statusFieldId = mockWorkflowConfig.statusFieldId ?? 'fld_status'
    const fromStatusOptionId = String(record.values[statusFieldId] ?? '')
    const updated: RecordModel = {
      ...record,
      version: (record.version ?? 0) + 1,
      values: {
        ...record.values,
        [statusFieldId]: payload.toStatusOptionId,
      },
    }
    recordsById.set(recordId, updated)
    const idx = mockRecords.findIndex((item) => item.id === recordId)
    if (idx >= 0) {
      mockRecords[idx] = updated
    }
    mockStatusLogs.unshift({
      id: mockStatusLogSeq++,
      recordId,
      tableId: updated.tableId,
      statusFieldId,
      fromOptionId: fromStatusOptionId || null,
      toOptionId: payload.toStatusOptionId,
      operatorUserId: 'usr_owner',
      operatorUsername: 'owner',
      source: payload.source ?? 'api',
      createdAt: new Date().toISOString(),
    })
    return delay({
      record: updated,
      fromStatusOptionId: fromStatusOptionId || null,
      toStatusOptionId: payload.toStatusOptionId,
    })
  },
  async getRecordStatusLogs(recordId) {
    return delay(mockStatusLogs.filter((item) => item.recordId === recordId))
  },
  async getViewTabs(viewId) {
    return delay((mockViewTabs[viewId] ?? []).map((item) => ({ ...item })))
  },
  async createViewTab(viewId, payload) {
    const view = mockViews.find((item) => item.id === viewId)
    const next = {
      id: `vtab_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      viewId,
      tableId: view?.tableId ?? 'tbl_1',
      name: payload.name,
      visibility: payload.visibility,
      ownerUserId: 'usr_owner',
      isSystemPreset: false,
      sortOrder: payload.sortOrder ?? (mockViewTabs[viewId]?.length ?? 0) + 10,
      payload: payload.payload,
    }
    mockViewTabs[viewId] = [...(mockViewTabs[viewId] ?? []), next]
    return delay(next)
  },
  async updateViewTab(viewId, tabId, payload) {
    const list = mockViewTabs[viewId] ?? []
    const idx = list.findIndex((item) => item.id === tabId)
    if (idx < 0) {
      throw new Error('标签不存在')
    }
    const merged = { ...list[idx], ...payload, payload: payload.payload ?? list[idx].payload }
    list[idx] = merged
    mockViewTabs[viewId] = [...list]
    return delay(merged)
  },
  async deleteViewTab(viewId, tabId) {
    const list = mockViewTabs[viewId] ?? []
    mockViewTabs[viewId] = list.filter((item) => item.id !== tabId)
    return delay(undefined)
  },
  async getKanbanColumns(viewId, query) {
    const view = mockViews.find((item) => item.id === viewId)
    const tableId = view?.tableId ?? 'tbl_1'
    const statusFieldId = mockWorkflowConfig.statusFieldId ?? 'fld_status'
    let items = mockRecords.filter((record) => record.tableId === tableId)
    if (query?.filters?.length) {
      items = applyFilters(items, query.filters, query.filterLogic ?? 'and')
    }
    if (query?.sorts?.length) {
      items = applySorts(items, query.sorts)
    }
    const options = mockFields.find((field) => field.id === statusFieldId)?.options ?? []
    const columns = options.map((option) => ({
      optionId: option.id,
      name: option.name,
      color: option.color,
      count: 0,
      items: [] as Array<{
        recordId: string
        tableId: string
        version: number
        statusOptionId: string
        title: string
        owner: string | null
        dueDate: string | null
        values: Record<string, unknown>
      }>,
    }))
    const columnMap = new Map(columns.map((item) => [item.optionId, item]))
    for (const record of items) {
      const status = String(record.values[statusFieldId] ?? '')
      const column = columnMap.get(status)
      if (!column) {
        continue
      }
      column.items.push({
        recordId: record.id,
        tableId: record.tableId,
        version: record.version ?? 0,
        statusOptionId: status,
        title: String(record.values.fld_name ?? record.id),
        owner: record.values.fld_owner ? String(record.values.fld_owner) : null,
        dueDate: record.values.fld_due ? String(record.values.fld_due) : null,
        values: { ...record.values },
      })
    }
    columns.forEach((item) => {
      item.count = item.items.length
    })
    return delay({
      viewId,
      tableId,
      statusFieldId,
      columns,
    })
  },
  async moveKanbanCard(_viewId, payload) {
    const record = recordsById.get(payload.recordId)
    if (!record) {
      throw new Error('记录不存在')
    }
    const statusFieldId = mockWorkflowConfig.statusFieldId ?? 'fld_status'
    const fromStatusOptionId = String(record.values[statusFieldId] ?? '')
    const updated: RecordModel = {
      ...record,
      version: (record.version ?? 0) + 1,
      values: {
        ...record.values,
        [statusFieldId]: payload.toStatusOptionId,
      },
    }
    recordsById.set(payload.recordId, updated)
    const idx = mockRecords.findIndex((item) => item.id === payload.recordId)
    if (idx >= 0) {
      mockRecords[idx] = updated
    }
    mockStatusLogs.unshift({
      id: mockStatusLogSeq++,
      recordId: payload.recordId,
      tableId: updated.tableId,
      statusFieldId,
      fromOptionId: fromStatusOptionId || null,
      toOptionId: payload.toStatusOptionId,
      operatorUserId: 'usr_owner',
      operatorUsername: 'owner',
      source: 'kanban',
      createdAt: new Date().toISOString(),
    })
    return delay({
      record: updated,
      fromStatusOptionId: fromStatusOptionId || null,
      toStatusOptionId: payload.toStatusOptionId,
    })
  },
})

export const defaultViewConfig = DEFAULT_VIEW_CONFIG
