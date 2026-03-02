import { memo } from 'react'
import type { RowComponentProps } from 'react-window'
import { CheckboxCheckedIcon, CheckboxEmptyIcon, EyeIcon } from '../components/icons'
import type { Field, RecordModel } from '../types/grid'
import { Cell } from '../cell/Cell'
import { useGridStore } from '../store/gridStore'
import { useShallow } from 'zustand/react/shallow'

interface RowDataProps {
  fields: Field[]
  records: RecordModel[]
  totalWidth: number
  rowNumWidth: number
  frozenLeftMap: Record<string, number>
}

function GridRowInner({ index, style, fields, records, totalWidth, rowNumWidth, frozenLeftMap }: RowComponentProps<RowDataProps>) {
  const record = records[index]
  const recordId = record?.id ?? ''
  const { openDrawer, toggleRecordSelected, isSelected } = useGridStore(
    useShallow((state) => ({
      openDrawer: state.openDrawer,
      toggleRecordSelected: state.toggleRecordSelected,
      isSelected:
        !!recordId && (state.isAllRecordsSelected || state.selectedRecordIds.includes(recordId)),
    })),
  )

  if (!record) {
    return null
  }

  return (
    <div className={`grid-row ${isSelected ? 'row-selected' : ''}`} style={{ ...style, width: totalWidth }}>
      <div className={`grid-rownum sticky-col grid-rownum-actions-host ${isSelected ? 'row-selected' : ''}`} style={{ width: rowNumWidth }}>
        <span className="grid-rownum-index">{index + 1}</span>
        <div className="grid-rownum-actions">
          <button
            className={`grid-rownum-icon-btn ${isSelected ? 'danger-selected' : ''}`}
            title={isSelected ? '取消勾选' : '勾选记录'}
            aria-label={isSelected ? '取消勾选记录' : '勾选记录'}
            onClick={(event) => {
              event.stopPropagation()
              toggleRecordSelected(record.id)
            }}
          >
            {isSelected ? <CheckboxCheckedIcon /> : <CheckboxEmptyIcon />}
          </button>
          <button
            className="grid-rownum-icon-btn detail-btn"
            title="查看详情"
            aria-label="查看记录详情"
            onClick={(event) => {
              event.stopPropagation()
              openDrawer(record.id)
            }}
          >
            <EyeIcon />
          </button>
        </div>
      </div>
      {fields.map((field) => {
        const width = field.width ?? 180
        return (
          <Cell
            key={`${record.id}-${field.id}`}
            rowId={record.id}
            field={field}
            value={record.values[field.id]}
            rowValues={record.values}
            width={width}
            stickyLeft={frozenLeftMap[field.id]}
          />
        )
      })}
    </div>
  )
}

const isSameStyle = (
  prevStyle: RowComponentProps<RowDataProps>['style'],
  nextStyle: RowComponentProps<RowDataProps>['style'],
) =>
  prevStyle.top === nextStyle.top &&
  prevStyle.left === nextStyle.left &&
  prevStyle.width === nextStyle.width &&
  prevStyle.height === nextStyle.height

export const GridRow = memo(
  GridRowInner,
  (prev, next) =>
    prev.index === next.index &&
    prev.fields === next.fields &&
    prev.records[prev.index] === next.records[next.index] &&
    prev.totalWidth === next.totalWidth &&
    prev.rowNumWidth === next.rowNumWidth &&
    prev.frozenLeftMap === next.frozenLeftMap &&
    isSameStyle(prev.style, next.style),
)
