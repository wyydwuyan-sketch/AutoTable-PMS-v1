import { requestJsonWithAuthStore as requestJson } from '../../utils/request'
import type {
  ApiConnector,
  ConnectorCreatePayload,
  Credential,
  CredentialCreatePayload,
  ExecutionLog,
  IntegrationStats,
} from './types'

export const integrationsApi = {
  getStats: () => requestJson<IntegrationStats>('/integrations/stats'),
  listConnectors: () => requestJson<ApiConnector[]>('/integrations/connectors'),
  createConnector: (body: ConnectorCreatePayload) =>
    requestJson<ApiConnector>('/integrations/connectors', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listCredentials: () => requestJson<Credential[]>('/integrations/credentials'),
  createCredential: (body: CredentialCreatePayload) =>
    requestJson<Credential>('/integrations/credentials', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteCredential: (id: string) =>
    requestJson<{ ok: boolean }>(`/integrations/credentials/${id}`, {
      method: 'DELETE',
    }),
  listLogs: () => requestJson<ExecutionLog[]>('/integrations/logs'),
  runConnector: (connectorId: string) =>
    requestJson<{ status: 'success' | 'failed'; rowsWritten: number; errorMsg?: string | null }>(
      `/integrations/connectors/${connectorId}/run`,
      { method: 'POST' },
    ),
  updateSchedule: (connectorId: string, body: { cronExpr: string; isEnabled: boolean }) =>
    requestJson<{ cronExpr: string; isEnabled: boolean; nextRunAt: string | null }>(
      `/integrations/connectors/${connectorId}/schedule`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    ),
}
