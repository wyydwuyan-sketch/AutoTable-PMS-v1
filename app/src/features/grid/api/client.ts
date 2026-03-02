import type {
  Field,
  FieldType,
  FilterCondition,
  FilterLogic,
  KanbanColumns,
  RecordModel,
  RecordStatusLog,
  ReferenceMember,
  SortCondition,
  TableButtonPermissionItem,
  TableButtonPermissions,
  TablePermissionItem,
  TablePermissionPatchItem,
  ViewTab,
  ViewTabPayload,
  ViewPermissionItem,
  View,
  ViewConfig,
  WorkflowConfig,
  WorkflowTransitionPair,
} from '../types/grid'

export interface RecordQueryOptions {
  sorts?: SortCondition[]
  filters?: FilterCondition[]
  filterLogic?: FilterLogic
}

export interface RecordPageResult {
  items: RecordModel[]
  nextCursor: string | null
  totalCount: number
}

export interface GridApiClient {
  getFields: (tableId: string) => Promise<Field[]>
  getViews: (tableId: string) => Promise<View[]>
  importViewBundle: (
    tableId: string,
    payload: {
      viewName: string
      viewType?: 'grid' | 'form' | 'kanban'
      fields: Array<{
        name: string
        type?: FieldType
        width?: number
        options?: Array<{ id: string; name: string; color?: string; parentId?: string }>
      }>
      records: Array<Record<string, unknown>>
    },
  ) => Promise<{
    viewId: string
    viewName: string
    fieldIds: string[]
    recordCount: number
  }>
  getRecords: (
    tableId: string,
    viewId: string,
    cursor?: string,
    pageSize?: number,
    query?: RecordQueryOptions
  ) => Promise<RecordPageResult>
  updateRecord: (recordId: string, valuesPatch: Record<string, unknown>, expectedVersion?: number) => Promise<RecordModel>
  createRecord: (tableId: string, initialValues?: Record<string, unknown>) => Promise<RecordModel>
  deleteRecord: (recordId: string) => Promise<void>
  createField: (tableId: string, name: string, type: FieldType, options?: Array<{ id: string; name: string; color?: string; parentId?: string }>) => Promise<Field>
  deleteField: (fieldId: string) => Promise<void>
  createView: (tableId: string, name: string, type: 'grid' | 'form' | 'kanban') => Promise<View>
  deleteView: (viewId: string) => Promise<void>
  updateView: (viewId: string, patch: { name?: string; type?: 'grid' | 'form' | 'kanban'; config?: ViewConfig }) => Promise<View>
  getTablePermissions: (tableId: string) => Promise<TablePermissionItem[]>
  updateTablePermissions: (tableId: string, items: TablePermissionPatchItem[]) => Promise<TablePermissionItem[]>
  applyTablePermissionsByRoleDefaults: (tableId: string) => Promise<TablePermissionItem[]>
  getTableButtonPermissions: (tableId: string) => Promise<TableButtonPermissionItem[]>
  updateTableButtonPermissions: (tableId: string, items: Array<{ userId: string; buttons: TableButtonPermissions }>) => Promise<TableButtonPermissionItem[]>
  getMyTableButtonPermissions: (tableId: string) => Promise<TableButtonPermissions>
  getViewPermissions: (viewId: string) => Promise<ViewPermissionItem[]>
  updateViewPermissions: (viewId: string, items: TablePermissionPatchItem[]) => Promise<ViewPermissionItem[]>
  applyViewPermissionsByRoleDefaults: (viewId: string) => Promise<ViewPermissionItem[]>
  getTableReferenceMembers: (tableId: string) => Promise<ReferenceMember[]>
  getWorkflowConfig: (tableId: string) => Promise<WorkflowConfig>
  updateWorkflowConfig: (
    tableId: string,
    payload: { statusFieldId: string | null; allowAnyTransition: boolean; finalStatusOptionIds: string[] },
  ) => Promise<WorkflowConfig>
  getWorkflowTransitions: (tableId: string) => Promise<WorkflowTransitionPair[]>
  updateWorkflowTransitions: (
    tableId: string,
    payload: Array<{ fromOptionId: string; toOptionIds: string[] }>,
  ) => Promise<WorkflowTransitionPair[]>
  transitionRecordStatus: (
    recordId: string,
    payload: { toStatusOptionId: string; source?: 'kanban' | 'drawer' | 'api'; expectedVersion?: number },
  ) => Promise<{ record: RecordModel; fromStatusOptionId: string | null; toStatusOptionId: string }>
  getRecordStatusLogs: (recordId: string) => Promise<RecordStatusLog[]>
  getViewTabs: (viewId: string) => Promise<ViewTab[]>
  createViewTab: (
    viewId: string,
    payload: { name: string; visibility: 'personal' | 'shared'; payload: ViewTabPayload; sortOrder?: number },
  ) => Promise<ViewTab>
  updateViewTab: (
    viewId: string,
    tabId: string,
    payload: { name?: string; visibility?: 'personal' | 'shared'; payload?: ViewTabPayload; sortOrder?: number },
  ) => Promise<ViewTab>
  deleteViewTab: (viewId: string, tabId: string) => Promise<void>
  getKanbanColumns: (
    viewId: string,
    query?: { filters?: FilterCondition[]; sorts?: SortCondition[]; filterLogic?: FilterLogic },
  ) => Promise<KanbanColumns>
  moveKanbanCard: (
    viewId: string,
    payload: { recordId: string; fromStatusOptionId?: string | null; toStatusOptionId: string; expectedVersion?: number },
  ) => Promise<{ record: RecordModel; fromStatusOptionId: string | null; toStatusOptionId: string }>
}

export const createApiClient = (client: GridApiClient): GridApiClient => client
