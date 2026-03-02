import { Line } from '@ant-design/charts'
import type { WidgetData } from '../../types'

type Item = {
  date: string
  value: number
}

export function LineWidget({ data }: { data: WidgetData }) {
  const rows = (data.data as Item[] | null) ?? []
  return (
    <Line
      data={rows}
      xField="date"
      yField="value"
      autoFit
      height={220}
      padding={[24, 12, 32, 36]}
      point={{ size: 3 }}
    />
  )
}

