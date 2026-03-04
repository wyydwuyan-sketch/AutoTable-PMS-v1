import { useEffect, useMemo, useRef, useState } from 'react'
import GridLayout from 'react-grid-layout'
import { useNavigate } from 'react-router-dom'
import { useDashboardStore } from './dashboardStore'
import { WidgetCard } from './components/WidgetCard'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export function DashboardPage() {
  const navigate = useNavigate()
  const dashboard = useDashboardStore((state) => state.dashboard)
  const isLoading = useDashboardStore((state) => state.isLoading)
  const loadDashboard = useDashboardStore((state) => state.loadDashboard)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [layoutWidth, setLayoutWidth] = useState(0)

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const updateWidth = () => setLayoutWidth(Math.max(320, Math.floor(el.clientWidth)))
    updateWidth()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth)
      return () => window.removeEventListener('resize', updateWidth)
    }
    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(el)
    return () => observer.disconnect()
  }, [dashboard?.widgets.length])

  const layouts = useMemo(
    () =>
      (dashboard?.widgets ?? []).map((widget) => ({
        i: widget.id,
        ...widget.layout,
        static: true,
      })),
    [dashboard?.widgets],
  )

  return (
    <div style={{ padding: 24, background: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="cm-btn" onClick={() => navigate('/b/base_1/t/tbl_1/v/viw_1')}>
            ← 返回表格
          </button>
          <button className="cm-btn" onClick={() => navigate('/integrations')}>
            接口管理
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>首页大屏 / 只读预览</span>
        </div>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {dashboard?.name ?? '首页大屏'}
        </h4>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="cm-skeleton" style={{ width: '30%', height: 24 }} />
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`dash-skeleton-${index}`} className="cm-skeleton" style={{ height: 170 }} />
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && dashboard && dashboard.widgets.length === 0 ? (
        <div className="app-empty-state" style={{ marginTop: 56 }}>
          <div className="app-empty-state-emoji" aria-hidden="true">📊</div>
          <div className="app-empty-state-title">大屏暂未配置</div>
          <div className="app-empty-state-desc">先前往配置页面添加组件与布局，保存后即可在这里预览。</div>
          <button className="cm-btn cm-btn--primary" onClick={() => navigate('/b/base_1/t/tbl_1/v/viw_1/config/dashboard')}>
            ⚙ 打开大屏配置
          </button>
        </div>
      ) : null}

      {!isLoading && dashboard && dashboard.widgets.length > 0 ? (
        <div ref={containerRef} style={{ width: '100%' }}>
          <GridLayout
            className="layout"
            layout={layouts}
            width={layoutWidth || 1200}
            gridConfig={{
              cols: 12,
              rowHeight: 80,
              margin: [10, 10],
              containerPadding: [0, 0],
              maxRows: Number.POSITIVE_INFINITY,
            }}
            dragConfig={{ enabled: false }}
            resizeConfig={{ enabled: false }}
          >
            {dashboard.widgets.map((widget) => (
              <div key={widget.id}>
                <WidgetCard widget={widget} readOnly />
              </div>
            ))}
          </GridLayout>
        </div>
      ) : null}
    </div>
  )
}
