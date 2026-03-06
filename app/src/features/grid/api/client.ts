import type {
  Field,
  FieldType,
  FilterCondition,
  FilterLogic,
  KanbanColumns,
  RecordModel,
  RecordStatusLog,
  ReferenceMember,
  TableCatalogItem,
  SortCondition,
  TableButtonPermissionItem,
  TableButtonPermissions,
  TablePermissionItem,
  TablePermissionPatchItem,
  ViewCatalog,
  ViewTab,
  ViewTabPayload,
  ViewFolder,
  ViewPermissionItem,
  View,
  ViewConfig,
  ViewRole,
  ViewType,
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

export interface CreateViewOptions {
  folderId?: string | null
  sourceViewId?: string | null
  viewRole?: ViewRole
}

export interface GridApiClient {
  getTables: (baseId: string) => Promise<TableCatalogItem[]>
  createTable: (baseId: string, name: string) => Promise<TableCatalogItem>
  updateTable: (tableId: string, patch: { name?: string }) => Promise<TableCatalogItem>
  deleteTable: (tableId: string) => Promise<void>
  reorderTables: (baseId: string, orderedIds: string[]) => Promise<TableCatalogItem[]>
  getFields: (tableId: string) => Promise<Field[]>
  getViews: (tableId: string) => Promise<View[]>
  getViewCatalog: (tableId: string) => Promise<ViewCatalog>
  createViewFolder: (tableId: string, name: string) => Promise<ViewFolder>
  updateViewFolder: (folderId: string, patch: { name?: string; isEnabled?: boolean }) => Promise<ViewFolder>
  reorderViewFolders: (tableId: string, orderedIds: string[]) => Promise<ViewFolder[]>
  deleteViewFolder: (folderId: string) => Promise<void>
  importViewBundle: (
    tableId: string,
    payload: {
      viewName: string
      viewType?: ViewType
      folderId?: string | null
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
  createView: (tableId: string, name: string, type: ViewType, options?: CreateViewOptions) => Promise<View>
  deleteView: (viewId: string) => Promise<void>
  updateView: (
    viewId: string,
    patch: { name?: string; type?: ViewType; config?: ViewConfig; folderId?: string | null; sourceViewId?: string | null; viewRole?: ViewRole },
  ) => Promise<View>
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
  getWorkflowTransitions: (tableId: string) => Promise<WorkflowTransitionPair[]>
  transitionRecordStatus: (
    recordId: string,
    payload: { toStatusOptionId: string; source?: 'kanban' | 'drawer' | 'api'; expectedVersion?: number },
  ) => Promise<{ record: RecordModel; fromStatusOptionId: string | null; toStatusOptionId: string }>
  getRecordStatusLogs: (recordId: string) => Promise<RecordStatusLog[]>
  getViewTabs: (viewId: string) => Promise<ViewTab[]>
  batchTabCounts: (
    tableId: string,
    viewId: string,
    tabs: Array<{ tabId: string; payload: ViewTabPayload }>,
  ) => Promise<Record<string, number>>
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
