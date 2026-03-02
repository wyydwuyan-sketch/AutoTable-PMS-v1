import { useEffect, useMemo, useState } from 'react'
import GridLayout from 'react-grid-layout'
import { useNavigate, useParams } from 'react-router-dom'
import { useDashboardStore } from '../../dashboard/dashboardStore'
import { WidgetCard } from '../../dashboard/components/WidgetCard'
import { WidgetEditor } from '../../dashboard/components/WidgetEditor'
import type { DashboardWidget } from '../../dashboard/types'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

type LayoutItem = { i: string; x: number; y: number; w: number; h: number }

export function DashboardConfig() {
  const navigate = useNavigate()
  const { tableId = 'tbl_1' } = useParams()
  const dashboard = useDashboardStore((state) => state.dashboard)
  const isLoading = useDashboardStore((state) => state.isLoading)
  const loadDashboard = useDashboardStore((state) => state.loadDashboard)
  const updateLayout = useDashboardStore((state) => state.updateLayout)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null)

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const layouts = useMemo(
    () =>
      (dashboard?.widgets ?? []).map((widget) => ({
        i: widget.id,
        ...widget.layout,
        minW: 2,
        minH: 2,
      })),
    [dashboard?.widgets],
  )

  return (
    <div className="grid-root" style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          首页大屏配置
        </h4>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="cm-btn" onClick={() => navigate('/dashboard')}>
            👁 预览
          </button>
          <button
            className="cm-btn cm-btn--primary"
            onClick={() => {
              setEditingWidget(null)
              setEditorOpen(true)
            }}
          >
            + 添加组件
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', placeItems: 'center', marginTop: 80 }}>
          <span className="cm-spinner cm-spinner--lg" />
        </div>
      ) : null}

      {!isLoading && dashboard && dashboard.widgets.length === 0 ? (
        <div className="app-empty-state" style={{ marginTop: 80 }}>
          <div className="app-empty-state-emoji" aria-hidden="true">📊</div>
          <div className="app-empty-state-title">暂无组件</div>
          <div className="app-empty-state-desc">点击「添加组件」开始配置</div>
        </div>
      ) : null}

      {!isLoading && dashboard && dashboard.widgets.length > 0 ? (
        <GridLayout
          className="layout"
          layout={layouts}
          width={1200}
          gridConfig={{
            cols: 12,
            rowHeight: 80,
            margin: [10, 10],
            containerPadding: [0, 0],
            maxRows: Number.POSITIVE_INFINITY,
          }}
          dragConfig={{
            handle: '.widget-drag-handle',
            enabled: true,
          }}
          onLayoutChange={(nextLayout) => updateLayout(nextLayout as LayoutItem[])}
        >
          {dashboard.widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetCard
                widget={widget}
                onEdit={() => {
                  setEditingWidget(widget)
                  setEditorOpen(true)
                }}
              />
            </div>
          ))}
        </GridLayout>
      ) : null}

      <WidgetEditor
        open={editorOpen}
        widget={editingWidget}
        defaultTableId={tableId}
        onClose={() => {
          setEditorOpen(false)
          setEditingWidget(null)
        }}
      />
    </div>
  )
}
