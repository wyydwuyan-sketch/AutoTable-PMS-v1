import { create } from 'zustand'
import { tableItems } from '../../config/tables'
import { integrationsApi } from './api'
import type {
  ApiConnector,
  ConnectorCreatePayload,
  ConnectorFieldOption,
  Credential,
  CredentialCreatePayload,
  ExecutionLog,
  ExecutionStatus,
  IntegrationStats,
} from './types'

type RunOutcome = {
  status: Exclude<ExecutionStatus, 'running'>
  rowsWritten: number
  errorMsg: string | null
}

type SeedData = {
  connectors: ApiConnector[]
  credentials: Credential[]
  logs: ExecutionLog[]
}

interface IntegrationsState {
  hasLoaded: boolean
  isBootstrapping: boolean
  error: string | null
  connectors: ApiConnector[]
  credentials: Credential[]
  logs: ExecutionLog[]
  stats: IntegrationStats
  actionLoadingById: Record<string, boolean>
  bootstrap: () => Promise<void>
  createConnector: (payload: ConnectorCreatePayload) => Promise<ApiConnector>
  updateSchedule: (connectorId: string, patch: { cronExpr: string; isEnabled: boolean }) => Promise<void>
  runConnector: (connectorId: string) => Promise<void>
  addCredential: (payload: CredentialCreatePayload) => Promise<Credential>
  removeCredential: (credentialId: string) => Promise<void>
  toggleConnectorEnabled: (connectorId: string, enabled: boolean) => void
  getFieldOptionsForTable: (tableId: string) => ConnectorFieldOption[]
}

const EMPTY_STATS: IntegrationStats = {
  totalConnectors: 0,
  enabledConnectors: 0,
  runsToday: 0,
  successRate: 0,
  failureCount: 0,
  runningCount: 0,
}

const DEFAULT_FIELD_OPTIONS: Record<string, ConnectorFieldOption[]> = {
  tbl_1: [
    { id: 'task_name', label: '任务名称' },
    { id: 'owner', label: '负责人' },
    { id: 'start_date', label: '开始日期' },
    { id: 'end_date', label: '截止日期' },
    { id: 'status', label: '状态' },
    { id: 'priority', label: '优先级' },
  ],
  tbl_work_orders: [
    { id: 'order_no', label: '工单编号' },
    { id: 'title', label: '工单标题' },
    { id: 'assignee', label: '处理人' },
    { id: 'order_status', label: '工单状态' },
    { id: 'created_at', label: '创建时间' },
    { id: 'closed_at', label: '关闭时间' },
  ],
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(() => resolve(), ms)
  })

const nowIso = () => new Date().toISOString()

const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`

const resolveTableName = (tableId: string) =>
  tableItems.find((item) => item.id === tableId)?.name ?? tableId

const maskSecret = (value: string) => {
  const visibleTail = value.slice(-4)
  return `${'*'.repeat(Math.max(4, value.length - 4))}${visibleTail}`
}

const isSameLocalDay = (leftIso: string, right: Date) => {
  const left = new Date(leftIso)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

const toSortedLogs = (logs: ExecutionLog[]) =>
  [...logs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())

const computeStats = (connectors: ApiConnector[], logs: ExecutionLog[]): IntegrationStats => {
  const today = new Date()
  const completed = logs.filter((log) => log.status === 'success' || log.status === 'failed')
  const successful = completed.filter((log) => log.status === 'success').length
  const successRate = completed.length === 0 ? 0 : Math.round((successful / completed.length) * 100)

  return {
    totalConnectors: connectors.length,
    enabledConnectors: connectors.filter((item) => item.isEnabled).length,
    runsToday: logs.filter((log) => isSameLocalDay(log.startedAt, today)).length,
    successRate,
    failureCount: logs.filter((log) => log.status === 'failed').length,
    runningCount: logs.filter((log) => log.status === 'running').length,
  }
}

const computeNextRunAt = (cronExpr: string, isEnabled: boolean, from: Date = new Date()) => {
  if (!isEnabled) return null
  const next = new Date(from)
  const trimmed = cronExpr.trim()

  if (trimmed === '* * * * *') {
    next.setMinutes(next.getMinutes() + 1, 0, 0)
    return next.toISOString()
  }

  const oncePerDay = /^0\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(trimmed)
  if (oncePerDay) {
    const hour = Number(oncePerDay[1])
    next.setHours(hour, 0, 0, 0)
    if (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + 1)
    }
    return next.toISOString()
  }

  next.setHours(next.getHours() + 6, 0, 0, 0)
  return next.toISOString()
}

const buildSeedData = (): SeedData => {
  const current = new Date()
  const minutesAgo = (value: number) => new Date(current.getTime() - value * 60 * 1000).toISOString()
  const minutesLater = (value: number) => new Date(current.getTime() + value * 60 * 1000).toISOString()

  const credentials: Credential[] = [
    {
      id: 'cred_demo_token',
      name: 'HR Bearer Token',
      authType: 'bearer',
      maskedSecret: '************4f2a',
      createdAt: minutesAgo(1200),
    },
    {
      id: 'cred_demo_basic',
      name: '工单 Basic 凭据',
      authType: 'basic',
      maskedSecret: '************a8c1',
      createdAt: minutesAgo(860),
    },
  ]

  const connectors: ApiConnector[] = [
    {
      id: 'conn_schedule_sync',
      name: '员工排班同步',
      description: '同步排班系统 API 数据到项目任务表',
      tableId: 'tbl_1',
      tableName: resolveTableName('tbl_1'),
      mode: 'config',
      method: 'GET',
      url: 'https://api.example.com/schedule/list',
      authType: 'bearer',
      credentialId: credentials[0].id,
      requestParams: { date: '{today}', pageSize: '200' },
      responsePath: 'data.items',
      isEnabled: true,
      createdAt: minutesAgo(1400),
      updatedAt: minutesAgo(30),
      lastRunAt: minutesAgo(18),
      lastStatus: 'success',
      totalRuns: 66,
      successRuns: 62,
      fieldMappings: [
        { id: 'fmap_1', sourceKey: 'employeeName', targetFieldId: 'owner', targetFieldLabel: '负责人' },
        { id: 'fmap_2', sourceKey: 'shiftName', targetFieldId: 'task_name', targetFieldLabel: '任务名称' },
        { id: 'fmap_3', sourceKey: 'workDate', targetFieldId: 'start_date', targetFieldLabel: '开始日期', transform: 'date:YYYY-MM-DD' },
      ],
      schedule: {
        cronExpr: '0 8 * * *',
        isEnabled: true,
        nextRunAt: minutesLater(170),
      },
    },
    {
      id: 'conn_order_sync',
      name: '工单状态回写',
      description: '回写外部工单系统状态',
      tableId: 'tbl_work_orders',
      tableName: resolveTableName('tbl_work_orders'),
      mode: 'config',
      method: 'POST',
      url: 'https://api.example.com/orders/sync',
      authType: 'basic',
      credentialId: credentials[1].id,
      requestParams: { changedAfter: '{yesterday}' },
      responsePath: 'records',
      isEnabled: true,
      createdAt: minutesAgo(900),
      updatedAt: minutesAgo(12),
      lastRunAt: minutesAgo(12),
      lastStatus: 'failed',
      totalRuns: 42,
      successRuns: 36,
      fieldMappings: [
        { id: 'fmap_4', sourceKey: 'orderNo', targetFieldId: 'order_no', targetFieldLabel: '工单编号' },
        { id: 'fmap_5', sourceKey: 'status', targetFieldId: 'order_status', targetFieldLabel: '工单状态' },
      ],
      schedule: {
        cronExpr: '*/30 * * * *',
        isEnabled: true,
        nextRunAt: minutesLater(16),
      },
    },
    {
      id: 'conn_master_data',
      name: '人员主数据同步',
      description: '每日同步人员基础信息',
      tableId: 'tbl_1',
      tableName: resolveTableName('tbl_1'),
      mode: 'config',
      method: 'GET',
      url: 'https://api.example.com/hr/employees',
      authType: 'none',
      credentialId: null,
      requestParams: {},
      responsePath: 'items',
      isEnabled: false,
      createdAt: minutesAgo(600),
      updatedAt: minutesAgo(90),
      lastRunAt: minutesAgo(190),
      lastStatus: 'success',
      totalRuns: 12,
      successRuns: 12,
      fieldMappings: [
        { id: 'fmap_6', sourceKey: 'name', targetFieldId: 'owner', targetFieldLabel: '负责人' },
        { id: 'fmap_7', sourceKey: 'hireDate', targetFieldId: 'start_date', targetFieldLabel: '开始日期' },
      ],
      schedule: {
        cronExpr: '0 6 * * *',
        isEnabled: false,
        nextRunAt: null,
      },
    },
  ]

  const logs: ExecutionLog[] = toSortedLogs([
    {
      id: 'log_1',
      connectorId: connectors[0].id,
      connectorName: connectors[0].name,
      startedAt: minutesAgo(18),
      finishedAt: minutesAgo(17),
      status: 'success',
      rowsWritten: 126,
      errorMsg: null,
      rawLog: '[INFO] 请求成功\n[INFO] 解析 126 行数据\n[SUCCESS] 写入完成',
    },
    {
      id: 'log_2',
      connectorId: connectors[1].id,
      connectorName: connectors[1].name,
      startedAt: minutesAgo(12),
      finishedAt: minutesAgo(11),
      status: 'failed',
      rowsWritten: 0,
      errorMsg: 'HTTP 502 Bad Gateway',
      rawLog: '[INFO] 请求外部接口\n[ERROR] HTTP 502 Bad Gateway',
    },
    {
      id: 'log_3',
      connectorId: connectors[2].id,
      connectorName: connectors[2].name,
      startedAt: minutesAgo(190),
      finishedAt: minutesAgo(189),
      status: 'success',
      rowsWritten: 55,
      errorMsg: null,
      rawLog: '[INFO] 请求成功\n[SUCCESS] 写入 55 行记录',
    },
    {
      id: 'log_4',
      connectorId: connectors[0].id,
      connectorName: connectors[0].name,
      startedAt: minutesAgo(1440),
      finishedAt: minutesAgo(1439),
      status: 'success',
      rowsWritten: 109,
      errorMsg: null,
      rawLog: '[INFO] 日常调度执行\n[SUCCESS] 完成',
    },
  ])

  return { connectors, credentials, logs }
}

const getTableFieldOptions = (tableId: string) =>
  DEFAULT_FIELD_OPTIONS[tableId] ?? [
    { id: 'name', label: '名称' },
    { id: 'status', label: '状态' },
    { id: 'updated_at', label: '更新时间' },
  ]

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  hasLoaded: false,
  isBootstrapping: false,
  error: null,
  connectors: [],
  credentials: [],
  logs: [],
  stats: EMPTY_STATS,
  actionLoadingById: {},

  bootstrap: async () => {
    if (get().hasLoaded || get().isBootstrapping) return

    set({ isBootstrapping: true, error: null })
    try {
      const [stats, connectors, credentials, logs] = await Promise.all([
        integrationsApi.getStats(),
        integrationsApi.listConnectors(),
        integrationsApi.listCredentials(),
        integrationsApi.listLogs(),
      ])
      const sortedLogs = toSortedLogs(logs)
      set({
        hasLoaded: true,
        isBootstrapping: false,
        connectors,
        credentials,
        logs: sortedLogs,
        stats,
      })
    } catch {
      const seed = buildSeedData()
      set({
        hasLoaded: true,
        isBootstrapping: false,
        connectors: seed.connectors,
        credentials: seed.credentials,
        logs: seed.logs,
        stats: computeStats(seed.connectors, seed.logs),
      })
    }
  },

  createConnector: async (payload) => {
    try {
      const created = await integrationsApi.createConnector(payload)
      set((state) => {
        const connectors = [created, ...state.connectors]
        return {
          connectors,
          stats: computeStats(connectors, state.logs),
        }
      })
      return created
    } catch {
      const createdAt = nowIso()
      const connector: ApiConnector = {
        id: makeId('conn'),
        name: payload.name,
        description: payload.description ?? null,
        tableId: payload.tableId,
        tableName: resolveTableName(payload.tableId),
        mode: payload.mode,
        method: payload.method,
        url: payload.url,
        authType: payload.authType,
        credentialId: payload.credentialId ?? null,
        requestParams: payload.requestParams ?? {},
        responsePath: payload.responsePath ?? null,
        isEnabled: payload.isEnabled ?? true,
        createdAt,
        updatedAt: createdAt,
        lastRunAt: null,
        lastStatus: null,
        totalRuns: 0,
        successRuns: 0,
        fieldMappings: payload.fieldMappings.map((mapping) => ({
          id: makeId('fmap'),
          sourceKey: mapping.sourceKey,
          targetFieldId: mapping.targetFieldId,
          targetFieldLabel: mapping.targetFieldLabel,
          transform: mapping.transform,
        })),
        schedule: {
          cronExpr: payload.schedule.cronExpr,
          isEnabled: payload.schedule.isEnabled,
          nextRunAt: computeNextRunAt(payload.schedule.cronExpr, payload.schedule.isEnabled),
        },
      }
      set((state) => {
        const connectors = [connector, ...state.connectors]
        return {
          connectors,
          stats: computeStats(connectors, state.logs),
        }
      })
      return connector
    }
  },

  updateSchedule: async (connectorId, patch) => {
    const updatedAt = nowIso()
    try {
      const schedule = await integrationsApi.updateSchedule(connectorId, patch)
      set((state) => ({
        connectors: state.connectors.map((connector) =>
          connector.id === connectorId
            ? {
                ...connector,
                updatedAt,
                schedule: {
                  cronExpr: schedule.cronExpr,
                  isEnabled: schedule.isEnabled,
                  nextRunAt: schedule.nextRunAt,
                },
              }
            : connector,
        ),
      }))
    } catch {
      set((state) => ({
        connectors: state.connectors.map((connector) =>
          connector.id === connectorId
            ? {
                ...connector,
                updatedAt,
                schedule: {
                  cronExpr: patch.cronExpr,
                  isEnabled: patch.isEnabled,
                  nextRunAt: computeNextRunAt(patch.cronExpr, patch.isEnabled),
                },
              }
            : connector,
        ),
      }))
    }
  },

  runConnector: async (connectorId) => {
    const connector = get().connectors.find((item) => item.id === connectorId)
    if (!connector) return

    const startedAt = nowIso()
    const pendingLogId = makeId('log')
    const runningLog: ExecutionLog = {
      id: pendingLogId,
      connectorId: connector.id,
      connectorName: connector.name,
      startedAt,
      finishedAt: null,
      status: 'running',
      rowsWritten: 0,
      errorMsg: null,
      rawLog: '[INFO] 准备连接外部接口...\n[INFO] 请求执行中...',
    }

    set((state) => {
      const logs = toSortedLogs([runningLog, ...state.logs])
      return {
        actionLoadingById: { ...state.actionLoadingById, [connectorId]: true },
        logs,
        stats: computeStats(state.connectors, logs),
      }
    })

    let outcome: RunOutcome
    try {
      const result = await integrationsApi.runConnector(connectorId)
      outcome = {
        status: result.status,
        rowsWritten: result.rowsWritten,
        errorMsg: result.errorMsg ?? null,
      }
    } catch {
      await wait(550)
      const succeeded = Date.now() % 5 !== 0
      outcome = succeeded
        ? { status: 'success', rowsWritten: 20 + Math.floor(Math.random() * 120), errorMsg: null }
        : { status: 'failed', rowsWritten: 0, errorMsg: 'Mock 模式：连接超时，请稍后重试。' }
    }

    const finishedAt = nowIso()
    set((state) => {
      const logs = state.logs.map((log) =>
        log.id === pendingLogId
          ? {
              ...log,
              status: outcome.status,
              finishedAt,
              rowsWritten: outcome.rowsWritten,
              errorMsg: outcome.errorMsg,
              rawLog:
                outcome.status === 'success'
                  ? '[INFO] 接口响应 200 OK\n[INFO] 数据解析完成\n[SUCCESS] 入库成功'
                  : '[INFO] 接口请求失败\n[ERROR] 连接超时',
            }
          : log,
      )
      const connectors = state.connectors.map((item) =>
        item.id === connectorId
          ? {
              ...item,
              updatedAt: finishedAt,
              lastRunAt: finishedAt,
              lastStatus: outcome.status,
              totalRuns: item.totalRuns + 1,
              successRuns: item.successRuns + (outcome.status === 'success' ? 1 : 0),
              schedule: {
                ...item.schedule,
                nextRunAt: computeNextRunAt(item.schedule.cronExpr, item.schedule.isEnabled, new Date(finishedAt)),
              },
            }
          : item,
      )
      return {
        connectors,
        logs: toSortedLogs(logs),
        stats: computeStats(connectors, logs),
        actionLoadingById: { ...state.actionLoadingById, [connectorId]: false },
      }
    })
  },

  addCredential: async (payload) => {
    try {
      const created = await integrationsApi.createCredential(payload)
      set((state) => ({
        credentials: [created, ...state.credentials],
      }))
      return created
    } catch {
      const created: Credential = {
        id: makeId('cred'),
        name: payload.name,
        authType: payload.authType,
        maskedSecret: maskSecret(payload.secret),
        createdAt: nowIso(),
      }
      set((state) => ({
        credentials: [created, ...state.credentials],
      }))
      return created
    }
  },

  removeCredential: async (credentialId) => {
    try {
      await integrationsApi.deleteCredential(credentialId)
    } catch {
      // 先实现前端页面，后端接口可用后会自动走上面的删除请求。
    }
    set((state) => ({
      credentials: state.credentials.filter((item) => item.id !== credentialId),
      connectors: state.connectors.map((connector) =>
        connector.credentialId === credentialId ? { ...connector, credentialId: null } : connector,
      ),
    }))
  },

  toggleConnectorEnabled: (connectorId, enabled) => {
    set((state) => {
      const connectors = state.connectors.map((connector) =>
        connector.id === connectorId
          ? {
              ...connector,
              isEnabled: enabled,
              updatedAt: nowIso(),
            }
          : connector,
      )
      return {
        connectors,
        stats: computeStats(connectors, state.logs),
      }
    })
  },

  getFieldOptionsForTable: (tableId: string) => getTableFieldOptions(tableId),
}))
