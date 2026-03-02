import { memo, useMemo, useState } from 'react'
import type { Field } from '../types/grid'
import { useGridStore } from '../store/gridStore'
import { buildCascadePatch, getOptionsForField } from '../utils/cascadeRules'
import { LinkedSelect } from '../components/LinkedSelect'
import { useShallow } from 'zustand/react/shallow'

interface CellProps {
  rowId: string
  field: Field
  value: unknown
  rowValues: Record<string, unknown>
  width: number
  stickyLeft?: number
}

const formatCellValue = (value: unknown, fieldType: Field['type']) => {
  if (value == null || value === '') {
    return ''
  }
  if (fieldType === 'checkbox') {
    return value === true ? '已勾选' : '未勾选'
  }
  if (fieldType === 'attachment' || fieldType === 'image') {
    if (Array.isArray(value)) {
      return `${value.length} 个文件`
    }
    return String(value)
  }
  if (fieldType === 'multiSelect' && Array.isArray(value)) {
    return value.join(', ')
  }
  return String(value)
}

const parseInputByType = (nextValue: string, type: Field['type']): unknown => {
  if (type === 'singleSelect' || type === 'member') {
    return nextValue === '' ? null : nextValue
  }
  if (type === 'checkbox') {
    return nextValue === 'true'
  }
  if (type === 'number') {
    const number = Number(nextValue)
    return Number.isNaN(number) ? nextValue : number
  }
  return nextValue
}

const readFilesAsDataUrls = async (files: FileList | null) => {
  if (!files || files.length === 0) return []
  const readers = Array.from(files).map(
    (file) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('读取文件失败'))
        reader.readAsDataURL(file)
      }),
  )
  return Promise.all(readers)
}

function CellInner({ rowId, field, value, rowValues, width, stickyLeft }: CellProps) {
  const {
    fields,
    tableReferenceMembers,
    cascadeRules,
    viewComponents,
    isFocused,
    isEditing,
    setFocusedCell,
    setEditingCell,
    updateCellLocal,
    submitCellPatch,
  } = useGridStore(
    useShallow((state) => ({
      fields: state.fields,
      tableReferenceMembers: state.tableReferenceMembers,
      cascadeRules: state.cascadeRules,
      viewComponents: state.viewConfig.components,
      isFocused: state.focusedCell?.rowId === rowId && state.focusedCell?.fieldId === field.id,
      isEditing: state.editingCell?.rowId === rowId && state.editingCell?.fieldId === field.id,
      setFocusedCell: state.setFocusedCell,
      setEditingCell: state.setEditingCell,
      updateCellLocal: state.updateCellLocal,
      submitCellPatch: state.submitCellPatch,
    })),
  )
  const componentConfig = viewComponents?.[field.id]
  const componentType = componentConfig?.componentType ?? 'default'
  const memberNameMap = useMemo(
    () => new Map(tableReferenceMembers.map((item) => [item.userId, item.username])),
    [tableReferenceMembers],
  )
  const displayValue = useMemo(() => {
    if (field.type === 'member' || componentType === 'member') {
      const key = String(value ?? '')
      return key ? (memberNameMap.get(key) ?? key) : ''
    }
    return formatCellValue(value, field.type)
  }, [componentType, field.type, memberNameMap, value])
  const [draft, setDraft] = useState(displayValue)
  const [multiDraft, setMultiDraft] = useState<string[]>(Array.isArray(value) ? value.map(String) : [])
  const options = useMemo(() => {
    if (field.type !== 'singleSelect' && field.type !== 'multiSelect') {
      return []
    }
    return getOptionsForField(fields, rowValues, field.id, cascadeRules, viewComponents)
  }, [cascadeRules, field.id, field.type, fields, rowValues, viewComponents])
  const memberOptions = useMemo(
    () => tableReferenceMembers.map((item) => ({ id: item.userId, name: item.username, color: undefined })),
    [tableReferenceMembers],
  )
  const selectOptions =
    field.type === 'member' || componentType === 'member'
      ? memberOptions
      : componentType === 'select' && componentConfig?.options && componentConfig.options.length > 0
      ? componentConfig.options
      : options
  const colorOption = selectOptions.find((item) => item.id === String(value ?? ''))
  const selectAccentStyle = colorOption?.color
    ? {
        background: `${colorOption.color}1a`,
        color: colorOption.color,
        borderColor: `${colorOption.color}66`,
      }
    : undefined
  const isInlineInputCell =
    (field.type === 'text' && componentType !== 'textarea' && componentType !== 'upload' && componentType !== 'image') ||
    field.type === 'number' ||
    field.type === 'date' ||
    field.type === 'singleSelect' ||
    field.type === 'member'
  const isSelectLike =
    field.type === 'singleSelect' ||
    field.type === 'member' ||
    (field.type === 'text' && (componentType === 'select' || componentType === 'member' || componentType === 'cascader'))
  const isEditable = field.type !== 'checkbox'
  const cellStyle =
    stickyLeft === undefined
      ? { width }
      : {
          width,
          left: stickyLeft,
          position: 'sticky' as const,
          zIndex: isFocused ? 4 : 1,
        }
  const inputClassName = isInlineInputCell ? 'cell-input cell-input-inline' : 'cell-input'

  const startEditing = () => {
    if (field.type === 'checkbox') {
      return
    }
    setFocusedCell({ rowId, fieldId: field.id })
    if (field.type === 'date' && displayValue && !displayValue.includes('T')) {
      setDraft(`${displayValue}T00:00`)
    } else {
      setDraft(displayValue)
    }
    setMultiDraft(Array.isArray(value) ? value.map(String) : [])
    setEditingCell({ rowId, fieldId: field.id })
  }

  const commit = async () => {
    const parsed =
      (field.type === 'text' && (componentType === 'select' || componentType === 'member' || componentType === 'cascader' || componentType === 'date'))
        ? (draft === '' ? null : draft)
        : parseInputByType(draft, field.type)
    if (parsed === value) {
      setEditingCell(null)
      return
    }
    const patch = buildCascadePatch(fields, rowValues, field.id, parsed, cascadeRules, viewComponents)
    for (const [patchFieldId, patchValue] of Object.entries(patch)) {
      updateCellLocal(rowId, patchFieldId, patchValue)
    }
    setEditingCell(null)
    await submitCellPatch(rowId, patch)
  }

  const commitMulti = async () => {
    const parsed: unknown = multiDraft
    const current = Array.isArray(value) ? value.map(String) : []
    if (JSON.stringify(parsed) === JSON.stringify(current)) {
      setEditingCell(null)
      return
    }
    const patch = buildCascadePatch(fields, rowValues, field.id, parsed, cascadeRules, viewComponents)
    for (const [patchFieldId, patchValue] of Object.entries(patch)) {
      updateCellLocal(rowId, patchFieldId, patchValue)
    }
    setEditingCell(null)
    await submitCellPatch(rowId, patch)
  }

  const toggleCheckbox = async () => {
    if (field.type !== 'checkbox') return
    const next = !(value === true)
    updateCellLocal(rowId, field.id, next)
    await submitCellPatch(rowId, { [field.id]: next })
  }

  const cancel = () => {
    setDraft(displayValue)
    setMultiDraft(Array.isArray(value) ? value.map(String) : [])
    setEditingCell(null)
  }

  return (
    <div
      className={[
        'grid-cell',
        isFocused ? 'focused' : '',
        isEditing ? 'editing' : '',
        isEditable ? 'editable' : '',
        stickyLeft === undefined ? '' : 'grid-cell-frozen',
      ]
        .filter(Boolean)
        .join(' ')}
      style={cellStyle}
      title={displayValue}
      onClick={() => {
        if (!isFocused) {
          setFocusedCell({ rowId, fieldId: field.id })
        }
      }}
      onDoubleClick={startEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !isEditing) {
          event.preventDefault()
          if (field.type === 'checkbox') {
            void toggleCheckbox()
          } else {
            startEditing()
          }
        }
        if (event.key === ' ' && field.type === 'checkbox') {
          event.preventDefault()
          void toggleCheckbox()
        }
      }}
      role="gridcell"
      tabIndex={0}
    >
      {isEditing ? (
        isSelectLike ? (
          <LinkedSelect
            className={inputClassName}
            autoFocus
            value={draft}
            style={selectAccentStyle}
            onChange={setDraft}
            onBlur={() => {
              void commit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
              if (event.key === 'Tab') {
                event.preventDefault()
                void commit()
              }
            }}
            options={selectOptions}
          />
        ) : field.type === 'multiSelect' ? (
          <select
            className="cell-input"
            autoFocus
            multiple
            value={multiDraft}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map((item) => item.value)
              setMultiDraft(selected)
            }}
            onBlur={() => {
              void commitMulti()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commitMulti()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
            }}
            style={{ height: 88 }}
          >
            {selectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : field.type === 'text' && componentType === 'textarea' ? (
          <textarea
            className="cell-input"
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              void commit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
              if (event.key === 'Tab') {
                event.preventDefault()
                void commit()
              }
            }}
            style={{ minHeight: 84, paddingTop: 8, resize: 'vertical' }}
          />
        ) : field.type === 'attachment' || field.type === 'image' || componentType === 'upload' || componentType === 'image' ? (
          <input
            className="cell-input"
            autoFocus
            type="file"
            multiple={field.type !== 'image' && componentType !== 'image'}
            accept={field.type === 'image' || componentType === 'image' ? 'image/*' : undefined}
            onBlur={() => setEditingCell(null)}
            onChange={(event) => {
              void (async () => {
                const urls = await readFilesAsDataUrls(event.target.files)
                const next = field.type === 'image' || componentType === 'image' ? urls.slice(0, 1) : urls
                updateCellLocal(rowId, field.id, next)
                setEditingCell(null)
                await submitCellPatch(rowId, { [field.id]: next })
              })()
            }}
          />
        ) : (
          <input
            className={inputClassName}
            autoFocus
            type={field.type === 'date' || componentType === 'date' ? 'datetime-local' : 'text'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              void commit()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void commit()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancel()
              }
              if (event.key === 'Tab') {
                event.preventDefault()
                void commit()
              }
            }}
          />
        )
      ) : field.type === 'checkbox' ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={() => {
            void toggleCheckbox()
          }}
          aria-label={field.name}
        />
      ) : colorOption?.color ? (
        <span
          className="cell-text"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            borderRadius: 999,
            background: `${colorOption.color}22`,
            color: colorOption.color,
            border: `1px solid ${colorOption.color}55`,
            maxWidth: '100%',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: colorOption.color,
              flexShrink: 0,
            }}
          />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayValue}</span>
        </span>
      ) : (
        <span className="cell-text">{displayValue}</span>
      )}
    </div>
  )
}

export const Cell = memo(
  CellInner,
  (prev, next) =>
    prev.rowId === next.rowId &&
    prev.field.id === next.field.id &&
    prev.field.type === next.field.type &&
    prev.width === next.width &&
    Object.is(prev.value, next.value) &&
    prev.rowValues === next.rowValues,
)
