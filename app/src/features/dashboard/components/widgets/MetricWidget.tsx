import type { WidgetData } from '../../types'

type MetricPayload = {
  value?: number | string
  label?: string
}

export function MetricWidget({ data }: { data: WidgetData }) {
  const metric = (data.data ?? {}) as MetricPayload
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{metric.label ?? '指标'}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-main)' }}>{metric.value ?? 0}</div>
      </div>
    </div>
  )
}
