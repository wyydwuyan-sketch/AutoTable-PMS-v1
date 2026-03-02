export type WidgetType = 'metric' | 'bar' | 'line' | 'pie' | 'table'
export type AggregationType = 'count' | 'sum' | 'avg'
export type DateBucket = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface DashboardTableSummary {
  id: string
  baseId: string
  name: string
}

export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardWidget {
  id: string
  type: WidgetType
  title: string
  tableId: string | null
  fieldIds: string[]
  aggregation: AggregationType
  groupFieldId: string | null
  layout: WidgetLayout
  config: Record<string, unknown>
  sortOrder: number
  createdAt: string
}

export interface Dashboard {
  id: string
  name: string
  widgets: DashboardWidget[]
  createdAt: string
}

export interface WidgetData {
  type: WidgetType
  data: unknown
  error?: string
  fieldIds?: string[]
  fieldNameMap?: Record<string, string>
}

export interface WidgetCreatePayload {
  type: WidgetType
  title?: string
  tableId?: string | null
  fieldIds?: string[]
  aggregation?: AggregationType
  groupFieldId?: string | null
  layout?: WidgetLayout
  config?: Record<string, unknown>
}

export interface WidgetUpdatePayload {
  title?: string
  tableId?: string | null
  fieldIds?: string[]
  aggregation?: AggregationType
  groupFieldId?: string | null
  layout?: WidgetLayout
  config?: Record<string, unknown>
  sortOrder?: number
}

