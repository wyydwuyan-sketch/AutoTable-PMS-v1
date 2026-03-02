import type { DashboardWidget } from '../types'
import { confirmAction } from '../../../utils/confirmAction'
import { useDashboardStore } from '../dashboardStore'
import { WidgetRenderer } from './WidgetRenderer'

type Props = {
  widget: DashboardWidget
  readOnly?: boolean
  onEdit?: () => void
}

export function WidgetCard({ widget, readOnly = false, onEdit }: Props) {
  const deleteWidget = useDashboardStore((state) => state.deleteWidget)
  const widgetData = useDashboardStore((state) => state.widgetDataMap[widget.id])

  const handleDelete = async () => {
    const confirmed = await confirmAction({
      title: '确认删除此组件？',
      okText: '删除',
      danger: true,
    })
    if (confirmed) void deleteWidget(widget.id)
  }

  return (
    <div className="widget-card">
      <div className="widget-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!readOnly ? <span className="widget-drag-handle" style={{ cursor: 'grab', color: '#999' }}>⋮⋮</span> : null}
          <span style={{ fontWeight: 600, fontSize: 14 }}>{widget.title}</span>
        </div>
        {readOnly ? null : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="cm-btn cm-btn--sm" onClick={onEdit}>
              ✏️ 编辑
            </button>
            <button className="cm-btn cm-btn--sm cm-btn--danger" onClick={() => void handleDelete()}>
              🗑 删除
            </button>
          </div>
        )}
      </div>
      <div className="widget-card-body">
        <WidgetRenderer widget={widget} data={widgetData} />
      </div>
    </div>
  )
}
