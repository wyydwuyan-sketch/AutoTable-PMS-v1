import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

type OperationLogAction = 'create_record' | 'update_record' | 'delete_record' | 'import_records'

type OperationLogItem = {
  id: string
  tableId: string
  action: OperationLogAction
  message: string
  recordId?: string
  changedFields?: string[]
  count?: number
  createdAt: string
}

const OPERATION_LOGS_KEY = 'grid_operation_logs'
const OPERATION_LOG_EVENT = 'grid_operation_logs_updated'

const actionLabel: Record<OperationLogAction, string> = {
  create_record: '新增记录',
  update_record: '更新记录',
  delete_record: '删除记录',
  import_records: '导入记录',
}

const readLogs = (): OperationLogItem[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(OPERATION_LOGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as OperationLogItem[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function OperationLogs() {
  const { tableId = 'tbl_1' } = useParams()
  const [logs, setLogs] = useState<OperationLogItem[]>([])

  useEffect(() => {
    const sync = () => setLogs(readLogs())
    sync()
    window.addEventListener(OPERATION_LOG_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(OPERATION_LOG_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const currentTableLogs = useMemo(() => logs.filter((item) => item.tableId === tableId), [logs, tableId])

  return (
    <div className="grid-root" style={{ padding: 20, overflowY: 'auto' }}>
      <h3 style={{ marginTop: 0, marginBottom: 8 }}>业务配置 / 操作记录</h3>
      <p style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 16 }}>动态记录新增、编辑、删除、导入等数据操作。</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {currentTableLogs.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>当前数据表暂无操作记录。</div>
        ) : (
          currentTableLogs.map((item) => (
            <div key={item.id} style={{ border: '1px solid var(--border-color)', borderRadius: 8, padding: 12, background: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{actionLabel[item.action]}</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 14 }}>{item.message}</div>
              {item.recordId ? <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 12 }}>记录ID: {item.recordId}</div> : null}
              {item.changedFields && item.changedFields.length > 0 ? (
                <div style={{ marginTop: 4, color: 'var(--text-secondary)', fontSize: 12 }}>
                  变更字段: {item.changedFields.join(', ')}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

