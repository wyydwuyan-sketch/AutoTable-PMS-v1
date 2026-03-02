import { Pie } from '@ant-design/charts'
import type { WidgetData } from '../../types'

type Item = {
  name: string
  value: number
}

export function PieWidget({ data }: { data: WidgetData }) {
  const rows = (data.data as Item[] | null) ?? []
  return (
    <Pie
      data={rows}
      angleField="value"
      colorField="name"
      autoFit
      height={220}
      padding={[16, 16, 16, 16]}
      label={false}
      legend={{ position: 'bottom' }}
    />
  )
}

