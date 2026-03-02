import type { WidgetData } from '../../types'

type TableRow = Record<string, unknown> & { id: string }

export function TableWidget({ data }: { data: WidgetData }) {
  const rows = ((data.data as TableRow[] | null) ?? []).filter((item) => item && typeof item === 'object')
  const fieldNameMap = data.fieldNameMap ?? {}
  if (rows.length === 0) {
    return (
      <div className="app-empty-state" style={{ padding: 24 }}>
        <span className="app-empty-icon">📭</span>
        <span>暂无数据</span>
      </div>
    )
  }

  const sample = rows[0]
  const fieldKeys = Object.keys(sample).filter((key) => key !== 'id')

  return (
    <div style={{ overflowY: 'auto', maxHeight: 260, borderRadius: 8, border: '1px solid var(--border-color)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-hover)', textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>
            {fieldKeys.map((key) => (
              <th key={key} style={{ padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {fieldNameMap[key] ?? key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} style={{ borderTop: '1px solid var(--border-color)' }}>
              {fieldKeys.map((key) => (
                <td key={key} style={{ padding: '6px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row[key] === null || row[key] === undefined || row[key] === '' ? '-' : String(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
