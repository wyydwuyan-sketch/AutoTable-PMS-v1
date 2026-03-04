export type ConnectorMode = 'config' | 'plugin'
export type HttpMethod = 'GET' | 'POST'
export type AuthType = 'none' | 'bearer' | 'basic' | 'api_key'
export type ExecutionStatus = 'running' | 'success' | 'failed'

export interface ConnectorFieldOption {
  id: string
  label: string
}

export interface FieldMapping {
  id: string
  sourceKey: string
  targetFieldId: string
  targetFieldLabel: string
  transform?: string
}

export interface ConnectorSchedule {
  cronExpr: string
  isEnabled: boolean
  nextRunAt: string | null
}

export interface ApiConnector {
  id: string
  name: string
  description: string | null
  tableId: string
  tableName: string
  mode: ConnectorMode
  method: HttpMethod
  url: string
  authType: AuthType
  credentialId: string | null
  requestParams: Record<string, string>
  responsePath: string | null
  isEnabled: boolean
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  lastStatus: ExecutionStatus | null
  totalRuns: number
  successRuns: number
  fieldMappings: FieldMapping[]
  schedule: ConnectorSchedule
}

export interface Credential {
  id: string
  name: string
  authType: AuthType
  maskedSecret: string
  createdAt: string
}

export interface ExecutionLog {
  id: string
  connectorId: string
  connectorName: string
  startedAt: string
  finishedAt: string | null
  status: ExecutionStatus
  rowsWritten: number
  errorMsg: string | null
  rawLog: string
}

export interface IntegrationStats {
  totalConnectors: number
  enabledConnectors: number
  runsToday: number
  successRate: number
  failureCount: number
  runningCount: number
}

export interface ConnectorCreatePayload {
  name: string
  description?: string
  tableId: string
  mode: ConnectorMode
  method: HttpMethod
  url: string
  authType: AuthType
  credentialId?: string | null
  requestParams?: Record<string, string>
  responsePath?: string | null
  fieldMappings: Array<{
    sourceKey: string
    targetFieldId: string
    targetFieldLabel: string
    transform?: string
  }>
  schedule: {
    cronExpr: string
    isEnabled: boolean
  }
  isEnabled?: boolean
}

export interface CredentialCreatePayload {
  name: string
  authType: AuthType
  secret: string
}
