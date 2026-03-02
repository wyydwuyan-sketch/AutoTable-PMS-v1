import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { gridApiClient } from '../api'
import type { Field, WorkflowConfig, WorkflowTransitionPair } from '../types/grid'
import { useGridStore } from '../store/gridStore'
import { getApiErrorMessage } from '../../../utils/apiError'

const buildTransitionMap = (pairs: WorkflowTransitionPair[]) => {
  const map: Record<string, string[]> = {}
  for (const pair of pairs) {
    if (!map[pair.fromOptionId]) {
      map[pair.fromOptionId] = []
    }
    if (!map[pair.fromOptionId].includes(pair.toOptionId)) {
      map[pair.fromOptionId].push(pair.toOptionId)
    }
  }
  return map
}

export function WorkflowConfigPage() {
  const { tableId = 'tbl_1' } = useParams()
  const setToast = useGridStore((state) => state.setToast)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fields, setFields] = useState<Field[]>([])
  const [workflow, setWorkflow] = useState<WorkflowConfig | null>(null)
  const [transitionMap, setTransitionMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    let active = true
    setIsLoading(true)
    void (async () => {
      try {
        const [fieldList, workflowConfig, transitions] = await Promise.all([
          gridApiClient.getFields(tableId),
          gridApiClient.getWorkflowConfig(tableId),
          gridApiClient.getWorkflowTransitions(tableId),
        ])
        if (!active) return
        setFields(fieldList)
        setWorkflow(workflowConfig)
        setTransitionMap(buildTransitionMap(transitions))
      } catch (error) {
        if (!active) return
        setToast(getApiErrorMessage(error, '加载工作流配置失败。'), 'error')
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [setToast, tableId])

  const statusFieldCandidates = useMemo(
    () => fields.filter((field) => field.type === 'singleSelect'),
    [fields],
  )
  const selectedStatusField = useMemo(
    () => statusFieldCandidates.find((field) => field.id === workflow?.statusFieldId) ?? null,
    [statusFieldCandidates, workflow?.statusFieldId],
  )
  const statusOptions = selectedStatusField?.options ?? workflow?.statusOptions ?? []

  useEffect(() => {
    if (!workflow) return
    setTransitionMap((prev) => {
      const next: Record<string, string[]> = {}
      statusOptions.forEach((option) => {
        const exists = prev[option.id] ?? []
        next[option.id] = exists.filter((item) => statusOptions.some((opt) => opt.id === item))
      })
      return next
    })
  }, [statusOptions, workflow])

  if (isLoading) {
    return (
      <div style={{ padding: 20 }}>
        <div className="cm-skeleton" style={{ width: 260, height: 28, marginBottom: 18 }} />
        <div className="cm-skeleton" style={{ width: '100%', height: 280 }} />
      </div>
    )
  }

  if (!workflow) {
    return (
      <div className="app-empty-state">
        <div className="app-empty-state-title">工作流配置不可用</div>
      </div>
    )
  }

  const saveWorkflow = async () => {
    if (isSaving) return
    if (!workflow.statusFieldId) {
      setToast('请先选择状态字段。', 'warning')
      return
    }
    setIsSaving(true)
    try {
      await gridApiClient.updateWorkflowConfig(tableId, {
        statusFieldId: workflow.statusFieldId,
        allowAnyTransition: workflow.allowAnyTransition,
        finalStatusOptionIds: workflow.finalStatusOptionIds,
      })
      if (!workflow.allowAnyTransition) {
        await gridApiClient.updateWorkflowTransitions(
          tableId,
          statusOptions.map((option) => ({
            fromOptionId: option.id,
            toOptionIds: transitionMap[option.id] ?? [],
          })),
        )
      }
      const [latestWorkflow, latestTransitions] = await Promise.all([
        gridApiClient.getWorkflowConfig(tableId),
        gridApiClient.getWorkflowTransitions(tableId),
      ])
      setWorkflow(latestWorkflow)
      setTransitionMap(buildTransitionMap(latestTransitions))
      setToast('工作流配置已保存。', 'success')
    } catch (error) {
      setToast(getApiErrorMessage(error, '保存工作流配置失败。'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid-root" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ margin: 0 }}>工作流配置</h3>
        <button className="cm-btn cm-btn--primary" onClick={() => void saveWorkflow()} disabled={isSaving}>
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>

      <section className="cm-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>状态字段</span>
            <select
              className="drawer-input"
              value={workflow.statusFieldId ?? ''}
              onChange={(event) => {
                const next = event.target.value || null
                const field = statusFieldCandidates.find((item) => item.id === next)
                setWorkflow((prev) =>
                  prev
                    ? {
                      ...prev,
                      statusFieldId: next,
                      finalStatusOptionIds: prev.finalStatusOptionIds.filter((id) =>
                        (field?.options ?? []).some((opt) => opt.id === id),
                      ),
                    }
                    : prev,
                )
              }}
            >
              <option value="">请选择</option>
              {statusFieldCandidates.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={workflow.allowAnyTransition}
              onChange={(event) =>
                setWorkflow((prev) => (prev ? { ...prev, allowAnyTransition: event.target.checked } : prev))
              }
            />
            <span>不限制流转（任意状态可切换）</span>
          </label>

          <div style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>终态定义</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {statusOptions.map((option) => {
                const checked = workflow.finalStatusOptionIds.includes(option.id)
                return (
                  <label
                    key={option.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      border: '1px solid var(--border-color)',
                      borderRadius: 999,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setWorkflow((prev) => {
                          if (!prev) return prev
                          const current = new Set(prev.finalStatusOptionIds)
                          if (event.target.checked) current.add(option.id)
                          else current.delete(option.id)
                          return { ...prev, finalStatusOptionIds: [...current] }
                        })
                      }
                    />
                    <span>{option.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {!workflow.allowAnyTransition ? (
        <section className="cm-card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>流转规则</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {statusOptions.map((from) => (
              <div key={from.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{from.name} 可流转到</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {statusOptions
                    .filter((item) => item.id !== from.id)
                    .map((to) => {
                      const checked = (transitionMap[from.id] ?? []).includes(to.id)
                      return (
                        <label
                          key={`${from.id}_${to.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            border: '1px solid var(--border-color)',
                            borderRadius: 999,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setTransitionMap((prev) => {
                                const current = new Set(prev[from.id] ?? [])
                                if (event.target.checked) current.add(to.id)
                                else current.delete(to.id)
                                return { ...prev, [from.id]: [...current] }
                              })
                            }}
                          />
                          <span>{to.name}</span>
                        </label>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
