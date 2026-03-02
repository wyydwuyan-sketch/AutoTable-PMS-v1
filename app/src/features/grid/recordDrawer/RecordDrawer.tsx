import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { CustomSelect } from '../components/CustomSelect'
import { useGridStore } from '../store/gridStore'
import { buildCascadePatch, getOptionsForField } from '../utils/cascadeRules'
import { LinkedSelect } from '../components/LinkedSelect'
import { confirmAction } from '../../../utils/confirmAction'
import { gridApiClient } from '../api'
import type { RecordStatusLog, WorkflowConfig, WorkflowTransitionPair } from '../types/grid'
import { getApiErrorMessage } from '../../../utils/apiError'

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

const readFilesAsDataUrls = async (files: FileList | null) => {
  if (!files || files.length === 0) return []
  const readers = Array.from(files).map(
    (file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsDataURL(file)
      })
  )
  return Promise.all(readers)
}

type OperationLogAction = 'create_record' | 'update_record' | 'delete_record' | 'import_records'

type OperationLogItem = {
  id: string
  tableId: string
  action: OperationLogAction
  message: string
  recordId?: string
  changedFields?: string[]
  fieldChanges?: Array<{
    fieldId: string
    fieldName: string
    oldValue: unknown
    newValue: unknown
  }>
  createdAt: string
}

const OPERATION_LOGS_KEY = 'grid_operation_logs'
const OPERATION_LOG_EVENT = 'grid_operation_logs_updated'
const DRAWER_EXIT_MS = 220
const FIELD_TYPE_GROUP_LABEL: Record<string, string> = {
  text: '文本字段',
  number: '数字字段',
  date: '日期字段',
  singleSelect: '选择字段',
  multiSelect: '选择字段',
  checkbox: '布尔字段',
  attachment: '附件字段',
  image: '图片字段',
  member: '成员字段',
}

const readOperationLogs = (): OperationLogItem[] => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(OPERATION_LOGS_KEY)
    const parsed = raw ? (JSON.parse(raw) as OperationLogItem[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '空'
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map((item) => String(item)).join(', ') : '空'
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

export function RecordDrawer() {
  const fields = useGridStore((state) => state.fields)
  const tableReferenceMembers = useGridStore((state) => state.tableReferenceMembers)
  const cascadeRules = useGridStore((state) => state.cascadeRules)
  const viewConfig = useGridStore((state) => state.viewConfig)
  const records = useGridStore((state) => state.records)
  const drawerRecordId = useGridStore((state) => state.drawerRecordId)
  const closeDrawer = useGridStore((state) => state.closeDrawer)
  const upsertRecord = useGridStore((state) => state.upsertRecord)
  const deleteRecord = useGridStore((state) => state.deleteRecord)
  const updateCellLocal = useGridStore((state) => state.updateCellLocal)
  const submitCellPatch = useGridStore((state) => state.submitCellPatch)
  const setToast = useGridStore((state) => state.setToast)

  const [logs, setLogs] = useState<OperationLogItem[]>([])
  const [actionFilter, setActionFilter] = useState<'all' | OperationLogAction>('all')
  const [daysFilter, setDaysFilter] = useState<'all' | '7' | '30'>('all')
  const [limit, setLimit] = useState(20)
  const [displayRecordId, setDisplayRecordId] = useState<string | null>(null)
  const [drawerVisible, setDrawerVisible] = useState(false)
  const exitTimerRef = useRef<number | null>(null)
  const [logFilterNowMs, setLogFilterNowMs] = useState(0)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)
  const [workflowTransitions, setWorkflowTransitions] = useState<WorkflowTransitionPair[]>([])
  const [statusLogs, setStatusLogs] = useState<RecordStatusLog[]>([])
  const [statusActionLoading, setStatusActionLoading] = useState(false)
  const record = useMemo(() => records.find((item) => item.id === displayRecordId) ?? null, [displayRecordId, records])
  const groupedFields = useMemo(() => {
    const groups = new Map<string, typeof fields>()
    for (const field of fields) {
      const groupKey = field.type
      const list = groups.get(groupKey) ?? []
      list.push(field)
      groups.set(groupKey, list)
    }
    return Array.from(groups.entries()).map(([groupKey, groupFields]) => ({
      key: groupKey,
      title: FIELD_TYPE_GROUP_LABEL[groupKey] ?? '其他字段',
      fields: groupFields,
    }))
  }, [fields])
  const recordLogs = useMemo(() => {
    if (!record) return []
    const now = daysFilter === 'all' ? 0 : logFilterNowMs
    return logs
      .filter((item) => item.recordId === record.id)
      .filter((item) => (actionFilter === 'all' ? true : item.action === actionFilter))
      .filter((item) => {
        if (daysFilter === 'all') return true
        const dayMs = Number(daysFilter) * 24 * 60 * 60 * 1000
        return now - new Date(item.createdAt).getTime() <= dayMs
      })
      .slice(0, limit)
  }, [actionFilter, daysFilter, limit, logFilterNowMs, logs, record])

  useEffect(() => {
    const sync = () => {
      setLogFilterNowMs(Date.now())
      setLogs(readOperationLogs())
    }
    sync()
    window.addEventListener(OPERATION_LOG_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(OPERATION_LOG_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
    if (drawerRecordId) {
      startTransition(() => {
        setDisplayRecordId(drawerRecordId)
        setDrawerVisible(true)
      })
      return
    }
    if (displayRecordId) {
      startTransition(() => {
        setDrawerVisible(false)
      })
      exitTimerRef.current = window.setTimeout(() => {
        setDisplayRecordId(null)
        exitTimerRef.current = null
      }, DRAWER_EXIT_MS)
    }
  }, [displayRecordId, drawerRecordId])

  useEffect(() => () => {
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!record) {
      setWorkflowConfig(null)
      setWorkflowTransitions([])
      setStatusLogs([])
      return
    }
    let active = true
    void (async () => {
      try {
        const [workflow, transitions, logs] = await Promise.all([
          gridApiClient.getWorkflowConfig(record.tableId),
          gridApiClient.getWorkflowTransitions(record.tableId),
          gridApiClient.getRecordStatusLogs(record.id),
        ])
        if (!active) return
        setWorkflowConfig(workflow)
        setWorkflowTransitions(transitions)
        setStatusLogs(logs)
      } catch {
        if (!active) return
        setWorkflowConfig(null)
        setWorkflowTransitions([])
        setStatusLogs([])
      }
    })()
    return () => {
      active = false
    }
  }, [record])

  if (!record) {
    return null
  }

  const statusFieldId = workflowConfig?.statusFieldId ?? null
  const currentStatusOptionId = statusFieldId ? String(record.values[statusFieldId] ?? '') : ''
  const statusOptionMap = new Map((workflowConfig?.statusOptions ?? []).map((item) => [item.id, item.name]))
  const allowedStatusOptionIds = (() => {
    if (!workflowConfig || !statusFieldId) return []
    if (workflowConfig.allowAnyTransition) {
      return workflowConfig.statusOptions.map((item) => item.id).filter((id) => id !== currentStatusOptionId)
    }
    const direct = workflowTransitions
      .filter((item) => item.fromOptionId === currentStatusOptionId)
      .map((item) => item.toOptionId)
    return [...new Set(direct)].filter((id) => id !== currentStatusOptionId)
  })()
  const statusTimeline = statusLogs.slice(0, 50)

  const compactValue = (value: unknown) => {
    const text = formatValue(value)
    if (text.length <= 60) {
      return text
    }
    return `${text.slice(0, 60)}...`
  }

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(record.id)
      setToast('已复制记录 ID')
    } catch {
      setToast('复制失败，请手动复制')
    }
  }

  const handleDeleteRecord = async () => {
    const confirmed = await confirmAction({
      title: `确认删除记录 ${record.id}？`,
      content: '删除后不可恢复。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    await deleteRecord(record.id)
    closeDrawer()
  }

  const handleStatusTransition = async (toStatusOptionId: string) => {
    if (statusActionLoading) return
    setStatusActionLoading(true)
    try {
      const response = await gridApiClient.transitionRecordStatus(record.id, {
        toStatusOptionId,
        source: 'drawer',
        expectedVersion: record.version ?? 0,
      })
      upsertRecord(response.record)
      const nextLogs = await gridApiClient.getRecordStatusLogs(record.id)
      setStatusLogs(nextLogs)
      setToast('状态已更新。', 'success')
    } catch (error) {
      setToast(getApiErrorMessage(error, '状态流转失败。'), 'error')
    } finally {
      setStatusActionLoading(false)
    }
  }

  return (
    <>
      <div className={`drawer-mask ${drawerVisible ? 'is-open' : ''}`} onClick={closeDrawer} />
      <aside className={`record-drawer ${drawerVisible ? 'is-open' : ''}`}>
        <header className="drawer-header">
          <div className="drawer-header-main">
            <div>
              <h2>记录详情</h2>
              <div className="drawer-record-id">ID: {record.id}</div>
            </div>
          </div>
          <div className="drawer-actions">
            <button className="cm-btn cm-btn--sm" onClick={() => void handleCopyId()}>
              复制 ID
            </button>
            <button className="cm-btn cm-btn--sm cm-btn--danger" onClick={() => void handleDeleteRecord()}>
              删除记录
            </button>
            <button className="cm-btn" onClick={closeDrawer}>关闭</button>
          </div>
        </header>
        <div className="drawer-body">
          <div className="drawer-columns">
            <div className="drawer-col-left">
              {statusFieldId ? (
                <section className="drawer-field-group">
                  <div className="drawer-field-group-title">状态流转</div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      当前状态：
                      <strong style={{ marginLeft: 6 }}>
                        {(statusOptionMap.get(currentStatusOptionId) ?? currentStatusOptionId) || '未设置'}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allowedStatusOptionIds.length === 0 ? (
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>暂无可执行流转</span>
                      ) : (
                        allowedStatusOptionIds.map((optionId) => (
                          <button
                            key={optionId}
                            type="button"
                            className="cm-btn cm-btn--sm"
                            disabled={statusActionLoading}
                            onClick={() => void handleStatusTransition(optionId)}
                          >
                            变更为 {statusOptionMap.get(optionId) ?? optionId}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </section>
              ) : null}
              {groupedFields.map((group) => (
                <section className="drawer-field-group" key={group.key}>
                  <div className="drawer-field-group-title">{group.title}</div>
                  <div className="drawer-field-group-grid">
                    {group.fields.map((field) => {
                      const value = record.values[field.id]
                      const componentConfig = viewConfig.components?.[field.id]
                      const componentType = componentConfig?.componentType ?? 'default'
                      const options =
                        field.type === 'singleSelect' || field.type === 'multiSelect'
                          ? getOptionsForField(fields, record.values, field.id, cascadeRules, viewConfig.components)
                          : []
                      const selectOptions =
                        field.type === 'member' || componentType === 'member'
                          ? tableReferenceMembers.map((item) => ({ id: item.userId, name: item.username }))
                          : componentType === 'select' && componentConfig?.options && componentConfig.options.length > 0
                            ? componentConfig.options
                            : options
                      return (
                        <label className="drawer-field" key={field.id}>
                          <span className="drawer-label">{field.name}</span>
                          {field.type === 'singleSelect' || field.type === 'member' || (field.type === 'text' && (componentType === 'select' || componentType === 'member' || componentType === 'cascader')) ? (
                            <LinkedSelect
                              className="drawer-input"
                              value={value == null ? '' : String(value)}
                              onChange={(nextRaw) => {
                                const next = nextRaw === '' ? null : nextRaw
                                const patch = buildCascadePatch(fields, record.values, field.id, next, cascadeRules, viewConfig.components)
                                for (const [patchFieldId, patchValue] of Object.entries(patch)) {
                                  updateCellLocal(record.id, patchFieldId, patchValue)
                                }
                                void submitCellPatch(record.id, patch)
                              }}
                              options={selectOptions}
                            />
                          ) : field.type === 'multiSelect' ? (
                            <select
                              className="drawer-input"
                              multiple
                              value={toStringArray(value)}
                              onChange={(event) => {
                                const selected = Array.from(event.target.selectedOptions).map((item) => item.value)
                                updateCellLocal(record.id, field.id, selected)
                              }}
                              onBlur={(event) => {
                                const selected = Array.from(event.target.selectedOptions).map((item) => item.value)
                                void submitCellPatch(record.id, { [field.id]: selected })
                              }}
                              style={{ height: 96 }}
                            >
                              {selectOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                          ) : field.type === 'checkbox' ? (
                            <input
                              className="drawer-input"
                              type="checkbox"
                              checked={value === true}
                              onChange={(event) => {
                                updateCellLocal(record.id, field.id, event.target.checked)
                                void submitCellPatch(record.id, { [field.id]: event.target.checked })
                              }}
                            />
                          ) : field.type === 'text' && componentType === 'textarea' ? (
                            <textarea
                              className="drawer-input cm-textarea"
                              value={value == null ? '' : String(value)}
                              rows={3}
                              onChange={(event) => updateCellLocal(record.id, field.id, event.target.value)}
                              onBlur={(event) => {
                                void submitCellPatch(record.id, { [field.id]: event.target.value })
                              }}
                            />
                          ) : field.type === 'attachment' || field.type === 'image' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <input
                                className="drawer-input"
                                type="file"
                                multiple={field.type === 'attachment'}
                                accept={field.type === 'image' ? 'image/*' : undefined}
                                onChange={(event) => {
                                  void (async () => {
                                    const urls = await readFilesAsDataUrls(event.target.files)
                                    const next = field.type === 'attachment' ? [...toStringArray(value), ...urls] : urls.slice(0, 1)
                                    updateCellLocal(record.id, field.id, next)
                                    await submitCellPatch(record.id, { [field.id]: next })
                                  })()
                                }}
                              />
                              {toStringArray(value).length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                  {toStringArray(value).map((item, idx) =>
                                    field.type === 'image' ? (
                                      <img key={`${field.id}_${idx}`} src={item} alt={`image_${idx}`} style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }} />
                                    ) : (
                                      <a key={`${field.id}_${idx}`} href={item} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
                                        附件 {idx + 1}
                                      </a>
                                    )
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <input
                              className="drawer-input"
                              type={field.type === 'number' ? 'number' : (field.type === 'date' || componentType === 'date') ? 'datetime-local' : 'text'}
                              value={
                                value == null
                                  ? ''
                                  : field.type === 'date' && typeof value === 'string' && !value.includes('T')
                                    ? `${value}T00:00`
                                    : String(value)
                              }
                              onChange={(event) =>
                                updateCellLocal(
                                  record.id,
                                  field.id,
                                  field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value
                                )
                              }
                              onBlur={(event) => {
                                const next =
                                  field.type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value
                                void submitCellPatch(record.id, { [field.id]: next })
                              }}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
            <div className="drawer-col-right">
              <div className="drawer-log-title">状态流转历史</div>
              {statusTimeline.length === 0 ? (
                <div className="drawer-log-empty app-empty-state" style={{ marginBottom: 10 }}>
                  <div className="drawer-log-empty-emoji app-empty-state-emoji" aria-hidden="true">🕘</div>
                  <div className="drawer-log-empty-text app-empty-state-title">暂无状态流转记录</div>
                </div>
              ) : (
                <div className="drawer-log-timeline" style={{ marginBottom: 12 }}>
                  {statusTimeline.map((item) => (
                    <div key={`status_${item.id}`} className="drawer-log-item">
                      <div className="drawer-log-dot" aria-hidden="true" />
                      <div className="drawer-log-card">
                        <div className="drawer-log-message">
                          {statusOptionMap.get(item.fromOptionId ?? '') ?? item.fromOptionId ?? '未设置'} -&gt; {statusOptionMap.get(item.toOptionId) ?? item.toOptionId}
                        </div>
                        <div className="drawer-log-change-item">
                          操作人：{item.operatorUsername ?? item.operatorUserId ?? '系统'} · 来源：{item.source}
                        </div>
                        <div className="drawer-log-time">
                          {new Date(item.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="drawer-log-title">客户端操作日志</div>
              <div className="drawer-log-filters">
                <CustomSelect
                  value={actionFilter}
                  onChange={(value) => {
                    setLogFilterNowMs(Date.now())
                    setActionFilter((value ?? 'all') as 'all' | OperationLogAction)
                  }}
                  options={[
                    { value: 'all', label: '全部动作' },
                    { value: 'create_record', label: '新增' },
                    { value: 'update_record', label: '更新' },
                    { value: 'delete_record', label: '删除' },
                    { value: 'import_records', label: '导入' },
                  ]}
                />
                <CustomSelect
                  value={daysFilter}
                  onChange={(value) => {
                    setLogFilterNowMs(Date.now())
                    setDaysFilter((value ?? 'all') as 'all' | '7' | '30')
                  }}
                  options={[
                    { value: 'all', label: '全部时间' },
                    { value: '7', label: '最近7天' },
                    { value: '30', label: '最近30天' },
                  ]}
                />
                <CustomSelect
                  value={String(limit)}
                  onChange={(value) => {
                    setLogFilterNowMs(Date.now())
                    setLimit(Number(value ?? '20'))
                  }}
                  options={[
                    { value: '20', label: '最近20条' },
                    { value: '50', label: '最近50条' },
                    { value: '100', label: '最近100条' },
                  ]}
                />
              </div>
              {recordLogs.length === 0 ? (
                <div className="drawer-log-empty app-empty-state">
                  <div className="drawer-log-empty-emoji app-empty-state-emoji" aria-hidden="true">🕘</div>
                  <div className="drawer-log-empty-text app-empty-state-title">暂无该记录操作日志</div>
                  <div className="drawer-log-empty-sub app-empty-state-desc">后续对该记录的新增、修改、删除操作会显示在这里</div>
                </div>
              ) : (
                <div className="drawer-log-timeline">
                  {recordLogs.map((item) => (
                    <div key={item.id} className="drawer-log-item">
                      <div className="drawer-log-dot" aria-hidden="true" />
                      <div className="drawer-log-card">
                        <div className="drawer-log-message">{item.message}</div>
                        {item.fieldChanges && item.fieldChanges.length > 0 ? (
                          <div className="drawer-log-change-list">
                            {item.fieldChanges.map((change, idx) => (
                              <div
                                key={`${item.id}_${change.fieldId}_${idx}`}
                                className="drawer-log-change-item"
                                title={`${formatValue(change.oldValue)} -> ${formatValue(change.newValue)}`}
                              >
                                {change.fieldName}: {compactValue(change.oldValue)} -&gt; {compactValue(change.newValue)}
                              </div>
                            ))}
                          </div>
                        ) : item.changedFields && item.changedFields.length > 0 ? (
                          <div className="drawer-log-change-item" style={{ marginTop: 2 }}>
                            变更字段: {item.changedFields.join(', ')}
                          </div>
                        ) : null}
                        <div className="drawer-log-time">
                          {new Date(item.createdAt).toLocaleString('zh-CN')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}

