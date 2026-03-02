import { useEffect, useRef, useState } from 'react'
import { DropdownMenu } from '../components/DropdownMenu'
import type { DropdownMenuItem } from '../components/DropdownMenu'
import type { Field } from '../types/grid'

interface GridHeaderProps {
  fields: Field[]
  rowNumWidth: number
  totalWidth: number
  cornerTitle?: string
  frozenFieldIds?: string[]
  frozenLeftMap?: Record<string, number>
  onResizeColumn?: (fieldId: string, width: number) => void
  onSortField?: (fieldId: string, direction: 'asc' | 'desc') => void
  onToggleFreezeField?: (fieldId: string) => void
  onHideField?: (fieldId: string) => void
  allSelected?: boolean
  partiallySelected?: boolean
  onToggleSelectAll?: (checked: boolean) => void
}

const MIN_COLUMN_WIDTH = 100
const FIELD_TYPE_ICONS: Record<Field['type'], string> = {
  text: '📝',
  number: '🔢',
  date: '📅',
  singleSelect: '⬇',
  multiSelect: '☰',
  checkbox: '☑',
  attachment: '📎',
  image: '🖼',
  member: '👤',
}

export function GridHeader({
  fields,
  rowNumWidth,
  totalWidth,
  cornerTitle = '当前视图',
  frozenFieldIds = [],
  frozenLeftMap = {},
  onResizeColumn,
  onSortField,
  onToggleFreezeField,
  onHideField,
  allSelected = false,
  partiallySelected = false,
  onToggleSelectAll,
}: GridHeaderProps) {
  const selectAllRef = useRef<HTMLInputElement | null>(null)
  const [resizeSession, setResizeSession] = useState<{
    fieldId: string
    initialWidth: number
    startX: number
  } | null>(null)

  useEffect(() => {
    if (!selectAllRef.current) return
    selectAllRef.current.indeterminate = partiallySelected && !allSelected
  }, [allSelected, partiallySelected])

  useEffect(() => {
    if (!resizeSession || !onResizeColumn) {
      return
    }

    const { fieldId, initialWidth, startX } = resizeSession
    const handleMove = (event: MouseEvent) => {
      const next = Math.max(MIN_COLUMN_WIDTH, initialWidth + (event.clientX - startX))
      onResizeColumn(fieldId, next)
    }
    const handleUp = () => {
      setResizeSession(null)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [onResizeColumn, resizeSession])

  const startResize = (fieldId: string, initialWidth: number, startX: number) => {
    if (!onResizeColumn) {
      return
    }
    setResizeSession({ fieldId, initialWidth, startX })
  }
  const frozenSet = new Set(frozenFieldIds)

  const getHeaderMenuItems = (frozen: boolean): DropdownMenuItem[] => [
    { key: 'sort_asc', label: '排序（升序）' },
    { key: 'sort_desc', label: '排序（降序）' },
    { type: 'divider' },
    { key: 'freeze', label: frozen ? '取消冻结' : '冻结此列' },
    { key: 'hide', label: '列设置（隐藏）' },
  ]

  return (
    <div className="grid-header-wrap" style={{ width: totalWidth }}>
      <div className="grid-header-inner" style={{ width: totalWidth }}>
        <div
          className={`grid-header-rownum sticky-col ${allSelected || partiallySelected ? 'has-selection' : ''}`}
          style={{ width: rowNumWidth }}
        >
          <span className="grid-header-view-name" title={cornerTitle}>
            {cornerTitle}
          </span>
          <label className="grid-header-select-all-label">
            <input
              ref={selectAllRef}
              className="grid-header-select-all"
              type="checkbox"
              checked={allSelected}
              onChange={(event) => onToggleSelectAll?.(event.target.checked)}
              aria-label="全选当前页记录"
            />
            <span className="grid-header-select-all-hint">全选</span>
          </label>
        </div>
        {fields.map((field) => {
          const width = field.width ?? 180
          const stickyLeft = frozenLeftMap[field.id]
          const isFrozen = frozenSet.has(field.id)
          const cellStyle =
            stickyLeft === undefined
              ? { width }
              : {
                width,
                left: stickyLeft,
                position: 'sticky' as const,
                zIndex: 7,
              }
          return (
            <div className={`grid-header-cell ${isFrozen ? 'grid-header-cell-frozen' : ''}`} key={field.id} style={cellStyle}>
              <span className="grid-header-title" title={field.name}>
                <span className="grid-header-type-icon" aria-hidden="true">
                  {FIELD_TYPE_ICONS[field.type] ?? '•'}
                </span>
                <span className="grid-header-text">{field.name}</span>
              </span>
              <DropdownMenu
                items={getHeaderMenuItems(isFrozen)}
                onClick={({ key }) => {
                  if (key === 'sort_asc') {
                    onSortField?.(field.id, 'asc')
                    return
                  }
                  if (key === 'sort_desc') {
                    onSortField?.(field.id, 'desc')
                    return
                  }
                  if (key === 'freeze') {
                    onToggleFreezeField?.(field.id)
                    return
                  }
                  if (key === 'hide') {
                    onHideField?.(field.id)
                  }
                }}
              >
                <button
                  type="button"
                  className="grid-header-menu"
                  aria-label={`字段 ${field.name} 快捷菜单`}
                  onClick={(event) => event.stopPropagation()}
                >
                  ▾
                </button>
              </DropdownMenu>
              <div
                className="grid-col-resizer"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  startResize(field.id, width, event.clientX)
                }}
                role="separator"
                aria-label={`调整字段 ${field.name} 列宽`}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
