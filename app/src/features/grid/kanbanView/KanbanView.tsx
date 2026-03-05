import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { gridApiClient } from '../api'
import { useGridStore } from '../store/gridStore'
import type { KanbanColumns, RecordModel } from '../types/grid'
import { createDefaultViewConfig } from '../utils/viewConfig'
import { getApiErrorMessage } from '../../../utils/apiError'
import { RecordDrawer } from '../recordDrawer/RecordDrawer'

export function KanbanView() {
  const navigate = useNavigate()
  const { baseId = 'base_1', tableId = 'tbl_1', viewId = 'viw_1' } = useParams()
  const {
    views,
    activeViewId,
    viewConfig,
    setData,
    setRecordsPage,
    setLoading,
    isLoading,
    setToast,
    createRecord,
    tableButtonPermissions,
    openDrawer,
  } = useGridStore(
    useShallow((state) => ({
      views: state.views,
      activeViewId: state.activeViewId,
      viewConfig: state.viewConfig,
      setData: state.setData,
      setRecordsPage: state.setRecordsPage,
      setLoading: state.setLoading,
      isLoading: state.isLoading,
      setToast: state.setToast,
      createRecord: state.createRecord,
      tableButtonPermissions: state.tableButtonPermissions,
      openDrawer: state.openDrawer,
    })),
  )
  const [kanbanData, setKanbanData] = useState<KanbanColumns | null>(null)
  const [metaReady, setMetaReady] = useState(false)
  const [movingCardId, setMovingCardId] = useState<string>('')

  const queryKey = useMemo(
    () =>
      JSON.stringify({
        filters: viewConfig.filters,
        sorts: viewConfig.sorts,
        filterLogic: viewConfig.filterLogic ?? 'and',
      }),
    [viewConfig.filterLogic, viewConfig.filters, viewConfig.sorts],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    setMetaReady(false)
    void (async () => {
      try {
        const [nextFields, nextViews, referenceMembers, nextButtonPermissions] = await Promise.all([
          gridApiClient.getFields(tableId),
          gridApiClient.getViews(tableId),
          gridApiClient.getTableReferenceMembers(tableId),
          gridApiClient.getMyTableButtonPermissions(tableId),
        ])
        if (!active) return
        const activeView = nextViews.find((item) => item.id === viewId) ?? nextViews[0]
        const resolvedViewId = activeView?.id ?? viewId
        const resolvedConfig = activeView?.config ?? createDefaultViewConfig()
        setData(
          tableId,
          resolvedViewId,
          nextFields,
          referenceMembers,
          [],
          nextViews,
          resolvedConfig,
          0,
          nextButtonPermissions,
        )
        if (resolvedViewId !== viewId) {
          navigate(`/b/${baseId}/t/${tableId}/v/${resolvedViewId}/kanban`, { replace: true })
          return
        }
        if (activeView?.type !== 'kanban') {
          navigate(`/b/${baseId}/t/${tableId}/v/${resolvedViewId}`, { replace: true })
          return
        }
        setMetaReady(true)
      } catch (error) {
        if (!active) return
        setToast(getApiErrorMessage(error, '加载看板失败，请重试。'), 'error')
        setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [baseId, navigate, setData, setLoading, setToast, tableId, viewId])

  const reloadColumns = async () => {
    const targetViewId = activeViewId ?? viewId
    const payload = await gridApiClient.getKanbanColumns(targetViewId, {
      filters: viewConfig.filters,
      sorts: viewConfig.sorts,
      filterLogic: viewConfig.filterLogic ?? 'and',
    })
    setKanbanData(payload)
    const nextRecords: RecordModel[] = payload.columns.flatMap((column) =>
      column.items.map((card) => ({
        id: card.recordId,
        tableId: card.tableId,
        version: card.version,
        values: { ...card.values },
      })),
    )
    setRecordsPage(nextRecords, nextRecords.length)
  }

  useEffect(() => {
    if (!metaReady) return
    let active = true
    setLoading(true)
    void (async () => {
      try {
        await reloadColumns()
      } catch (error) {
        if (!active) return
        setToast(getApiErrorMessage(error, '加载看板数据失败。'), 'error')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [activeViewId, metaReady, queryKey, setLoading, setRecordsPage, setToast, viewConfig.filterLogic, viewConfig.filters, viewConfig.sorts, viewId])

  const statusFieldId = kanbanData?.statusFieldId ?? ''
  const canCreateRecord = tableButtonPermissions.canCreateRecord
  const currentViewName = views.find((view) => view.id === (activeViewId ?? viewId))?.name ?? '看板'

  if (isLoading) {
    return (
      <div style={{ padding: 12 }}>
        <div className="cm-skeleton" style={{ width: 240, height: 28, marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(260px, 1fr))', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`kanban-skeleton-${index}`} className="cm-skeleton" style={{ height: 360 }} />
          ))}
        </div>
      </div>
    )
  }

  if (!kanbanData) {
    return (
      <div className="app-empty-state" style={{ marginTop: 40 }}>
        <div className="app-empty-state-title">看板数据不可用</div>
      </div>
    )
  }

  return (
    <div className="grid-root" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontWeight: 600 }}>{currentViewName}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>按状态分列，可拖拽更新状态</div>
      </div>

      <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(260px, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {kanbanData.columns.map((column) => (
          <section
            key={column.optionId}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 10,
              background: 'var(--bg-panel)',
              minHeight: 420,
              display: 'flex',
              flexDirection: 'column',
            }}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              const text = event.dataTransfer.getData('application/json')
              if (!text) return
              const parsed = JSON.parse(text) as { recordId: string; fromStatusOptionId: string; version: number }
              if (!parsed.recordId || parsed.fromStatusOptionId === column.optionId || movingCardId === parsed.recordId) {
                return
              }
              setMovingCardId(parsed.recordId)
              void (async () => {
                try {
                  await gridApiClient.moveKanbanCard(viewId, {
                    recordId: parsed.recordId,
                    fromStatusOptionId: parsed.fromStatusOptionId,
                    toStatusOptionId: column.optionId,
                    expectedVersion: parsed.version,
                  })
                  await reloadColumns()
                  setToast('状态已更新。', 'success')
                } catch (error) {
                  setToast(getApiErrorMessage(error, '拖拽流转失败。'), 'error')
                } finally {
                  setMovingCardId('')
                }
              })()
            }}
          >
            <header style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: column.color || 'var(--primary)',
                  }}
                />
                {column.name}
              </strong>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{column.count}</span>
            </header>
            <div style={{ padding: 10, display: 'grid', gap: 8, alignContent: 'start' }}>
              {column.items.map((card) => (
                <article
                  key={card.recordId}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      'application/json',
                      JSON.stringify({
                        recordId: card.recordId,
                        fromStatusOptionId: column.optionId,
                        version: card.version,
                      }),
                    )
                  }}
                  onClick={() => openDrawer(card.recordId)}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 8,
                    background: 'var(--bg-app)',
                    padding: '8px 10px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 6, lineHeight: 1.35 }}>{card.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {card.owner ? `👤 ${card.owner}` : '未指派'}
                  </div>
                  {card.dueDate ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      截止：{card.dueDate}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {canCreateRecord ? (
              <div style={{ marginTop: 'auto', padding: 10 }}>
                <button
                  type="button"
                  className="cm-btn cm-btn--sm"
                  onClick={() =>
                    void (async () => {
                      await createRecord(tableId, { [statusFieldId]: column.optionId })
                      await reloadColumns()
                    })()
                  }
                >
                  + 新建
                </button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
      <RecordDrawer />
    </div>
  )
}
