import { Column } from '@ant-design/charts'
import type { WidgetData } from '../../types'

type Item = {
  name: string
  value: number
}

export function BarWidget({ data }: { data: WidgetData }) {
  const rows = (data.data as Item[] | null) ?? []
  return (
    <Column
      data={rows}
      xField="name"
      yField="value"
      autoFit
      height={220}
      padding={[24, 12, 32, 36]}
    />
  )
}

