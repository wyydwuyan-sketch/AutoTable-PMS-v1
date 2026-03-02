import type { Dashboard, DashboardTableSummary, DashboardWidget, WidgetCreatePayload, WidgetData, WidgetUpdatePayload } from './types'
import { requestJsonWithAuthStore as requestJson } from '../../utils/request'

export const dashboardApi = {
  getCurrent: () => requestJson<Dashboard>('/dashboards/current'),
  getTables: () => requestJson<DashboardTableSummary[]>('/dashboards/tables'),
  createWidget: (body: WidgetCreatePayload) =>
    requestJson<DashboardWidget>('/dashboards/widgets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateWidget: (id: string, patch: WidgetUpdatePayload) =>
    requestJson<DashboardWidget>(`/dashboards/widgets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteWidget: (id: string) =>
    requestJson<{ ok: boolean }>(`/dashboards/widgets/${id}`, {
      method: 'DELETE',
    }),
  getWidgetData: (id: string, payload?: Record<string, unknown>) =>
    requestJson<WidgetData>(`/dashboards/widgets/${id}/data`, {
      method: 'POST',
      body: JSON.stringify(payload ?? {}),
    }),
}
