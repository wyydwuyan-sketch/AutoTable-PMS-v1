import { createApiClient } from './client'
import type {
  Field,
  FieldType,
  FilterCondition,
  FilterLogic,
  RecordModel,
  TableButtonPermissions,
  View,
} from '../types/grid'
import { createDefaultViewConfig } from '../utils/viewConfig'
import { requestJsonWithAuthStore as requestJson } from '../../../utils/request'
import type { RequestError } from '../../../utils/request'

type RecordPageOut = {
  items: RecordModel[]
  nextCursor: string | null
  totalCount: number
}

const MAX_RECORDS_PAGE_SIZE = 500

const buildKanbanQuery = (query?: {
  filters?: FilterCondition[]
  sorts?: Array<{ fieldId: string; direction: 'asc' | 'desc' }>
  filterLogic?: FilterLogic
}) => {
  const params = new URLSearchParams()
  if (query?.filters) {
    params.set('filters', JSON.stringify(query.filters))
  }
  if (query?.sorts) {
    params.set('sorts', JSON.stringify(query.sorts))
  }
  if (query?.filterLogic) {
    params.set('filterLogic', query.filterLogic)
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export const httpGridApi = createApiClient({
  async getFields(tableId) {
    return requestJson<Field[]>(`/tables/${tableId}/fields`)
  },
  async getViews(tableId) {
    return requestJson<View[]>(`/tables/${tableId}/views`)
  },
  async importViewBundle(tableId, payload) {
    try {
      return await requestJson<{
        viewId: string
        viewName: string
        fieldIds: string[]
        recordCount: number
      }>(`/views/import?tableId=${encodeURIComponent(tableId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } catch (error) {
      if ((error as RequestError)?.status !== 404) {
        throw error
      }
      return requestJson<{
        viewId: string
        viewName: string
        fieldIds: string[]
        recordCount: number
      }>(`/tables/${tableId}/views/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    }
  },
  async getRecords(tableId, viewId, cursor, pageSize = 500, query) {
    const safePageSize = Math.max(1, Math.min(pageSize, MAX_RECORDS_PAGE_SIZE))
    return requestJson<RecordPageOut>(`/tables/${tableId}/records/query`, {
      method: 'POST',
      body: JSON.stringify({
        viewId,
        cursor,
        pageSize: safePageSize,
        filters: query?.filters,
        sorts: query?.sorts,
        filterLogic: query?.filterLogic,
      }),
    })
  },
  async updateRecord(recordId, valuesPatch, expectedVersion) {
    return requestJson<RecordModel>(`/records/${recordId}`, {
      method: 'PATCH',
      body: JSON.stringify({ valuesPatch, expectedVersion }),
    })
  },
  async createRecord(tableId, initialValues = {}) {
    return requestJson<RecordModel>(`/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ initialValues }),
    })
  },
  async deleteRecord(recordId) {
    await requestJson<void>(`/records/${recordId}`, { method: 'DELETE' })
  },
  async createField(tableId, name, type: FieldType, options) {
    return requestJson<Field>(`/tables/${tableId}/fields`, {
      method: 'POST',
      body: JSON.stringify({ name, type, width: 180, options }),
    })
  },
  async deleteField(fieldId) {
    await requestJson<void>(`/fields/${fieldId}`, { method: 'DELETE' })
  },
  async createView(tableId, name, type) {
    const config = createDefaultViewConfig()
    return requestJson<View>(`/tables/${tableId}/views`, {
      method: 'POST',
      body: JSON.stringify({ name, type, config }),
    })
  },
  async deleteView(viewId) {
    await requestJson<void>(`/views/${viewId}`, { method: 'DELETE' })
  },
  async updateView(viewId, patch) {
    return requestJson<View>(`/views/${viewId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },
  async getTablePermissions(tableId) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/tables/${tableId}/permissions`,
    )
  },
  async updateTablePermissions(tableId, items) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/tables/${tableId}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ items }),
      },
    )
  },
  async applyTablePermissionsByRoleDefaults(tableId) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/tables/${tableId}/permissions/apply-role-defaults`,
      {
        method: 'POST',
      },
    )
  },
  async getTableButtonPermissions(tableId) {
    return requestJson<Array<{ userId: string; username: string; buttons: TableButtonPermissions }>>(
      `/tables/${tableId}/button-permissions`,
    )
  },
  async updateTableButtonPermissions(tableId, items) {
    return requestJson<Array<{ userId: string; username: string; buttons: TableButtonPermissions }>>(
      `/tables/${tableId}/button-permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ items }),
      },
    )
  },
  async getMyTableButtonPermissions(tableId) {
    return requestJson<TableButtonPermissions>(`/tables/${tableId}/button-permissions/me`)
  },
  async getViewPermissions(viewId) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/views/${viewId}/permissions`,
    )
  },
  async updateViewPermissions(viewId, items) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/views/${viewId}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ items }),
      },
    )
  },
  async applyViewPermissionsByRoleDefaults(viewId) {
    return requestJson<Array<{ userId: string; username: string; canRead: boolean; canWrite: boolean }>>(
      `/views/${viewId}/permissions/apply-role-defaults`,
      {
        method: 'POST',
      },
    )
  },
  async getTableReferenceMembers(tableId) {
    return requestJson<Array<{ userId: string; username: string }>>(`/tables/${tableId}/reference-members`)
  },
  async getWorkflowConfig(tableId) {
    return requestJson(`/tables/${tableId}/workflow`)
  },
  async updateWorkflowConfig(tableId, payload) {
    return requestJson(`/tables/${tableId}/workflow`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  async getWorkflowTransitions(tableId) {
    return requestJson(`/tables/${tableId}/workflow/transitions`)
  },
  async updateWorkflowTransitions(tableId, payload) {
    return requestJson(`/tables/${tableId}/workflow/transitions`, {
      method: 'PUT',
      body: JSON.stringify({ transitions: payload }),
    })
  },
  async transitionRecordStatus(recordId, payload) {
    return requestJson(`/records/${recordId}/status-transition`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  async getRecordStatusLogs(recordId) {
    return requestJson(`/records/${recordId}/status-logs`)
  },
  async getViewTabs(viewId) {
    return requestJson(`/views/${viewId}/tabs`)
  },
  async createViewTab(viewId, payload) {
    return requestJson(`/views/${viewId}/tabs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  async updateViewTab(viewId, tabId, payload) {
    return requestJson(`/views/${viewId}/tabs/${tabId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  async deleteViewTab(viewId, tabId) {
    await requestJson<void>(`/views/${viewId}/tabs/${tabId}`, { method: 'DELETE' })
  },
  async getKanbanColumns(viewId, query) {
    const suffix = buildKanbanQuery(query)
    return requestJson(`/views/${viewId}/kanban-columns${suffix}`)
  },
  async moveKanbanCard(viewId, payload) {
    return requestJson(`/views/${viewId}/kanban-move`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
})
