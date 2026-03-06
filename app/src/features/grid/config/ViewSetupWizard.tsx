import { useEffect, useMemo, useState } from 'react'
import { CustomModal } from '../components/CustomModal'
import { CustomSelect } from '../components/CustomSelect'
import type { Field, FieldComponentConfig, FieldComponentType } from '../types/grid'
import { COMPONENT_OPTIONS_BY_FIELD_TYPE, COMPONENT_TYPE_LABELS, FIELD_TYPE_LABELS } from './FieldComponentPreview'
import './ViewSetupWizard.css'

interface ViewSetupWizardProps {
  open: boolean
  tableId: string
  viewId: string
  fields: Field[]
  onComplete: (visibleFieldIds: string[], components: Record<string, FieldComponentConfig>) => void
  onCancel: () => void
}

export function ViewSetupWizard({
  open,
  tableId,
  viewId,
  fields,
  onComplete,
  onCancel,
}: ViewSetupWizardProps) {
  const [checkedFieldIds, setCheckedFieldIds] = useState<string[]>([])
  const [componentTypeByFieldId, setComponentTypeByFieldId] = useState<Record<string, FieldComponentType>>({})

  useEffect(() => {
    if (!open) return
    setCheckedFieldIds([])
    setComponentTypeByFieldId(
      Object.fromEntries(fields.map((field) => [field.id, 'default' as FieldComponentType])),
    )
  }, [fields, open])

  const checkedFieldIdSet = useMemo(
    () => new Set(checkedFieldIds),
    [checkedFieldIds],
  )

  const checkedFields = useMemo(
    () => fields.filter((field) => checkedFieldIdSet.has(field.id)),
    [checkedFieldIdSet, fields],
  )

  const toggleField = (fieldId: string, checked: boolean) => {
    setCheckedFieldIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(fieldId)
      else next.delete(fieldId)
      return fields.map((field) => field.id).filter((id) => next.has(id))
    })
  }

  const handleSelectAll = () => {
    setCheckedFieldIds(fields.map((field) => field.id))
  }

  const handleSelectNone = () => {
    setCheckedFieldIds([])
  }

  const handleComplete = () => {
    const visibleFieldIds = checkedFields.map((field) => field.id)
    const components: Record<string, FieldComponentConfig> = {}
    for (const field of checkedFields) {
      const componentType = componentTypeByFieldId[field.id] ?? 'default'
      if (componentType === 'default') continue
      components[field.id] = { componentType }
    }
    onComplete(visibleFieldIds, components)
  }

  return (
    <CustomModal
      open={open}
      title={`初始化视图字段 · ${viewId}`}
      onCancel={onCancel}
      onOk={handleComplete}
      okText="完成初始化"
      cancelText="取消"
      width={860}
    >
      <div className="vsw-root">
        <div className="vsw-meta">
          当前视图默认为空，请手动选择要加入视图的字段。数据表：{tableId} · 共 {fields.length} 个字段
        </div>

        <section className="vsw-section">
          <div className="vsw-section-head">
            <strong>Step 1：选择要加入当前视图的字段</strong>
            <div className="vsw-actions">
              <button type="button" className="cm-btn cm-btn--sm" onClick={handleSelectAll}>全选</button>
              <button type="button" className="cm-btn cm-btn--sm" onClick={handleSelectNone}>全不选</button>
            </div>
          </div>

          <div className="vsw-field-list">
            {fields.map((field) => {
              const checked = checkedFieldIdSet.has(field.id)
              return (
                <label key={field.id} className="vsw-field-item">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleField(field.id, event.target.checked)}
                  />
                  <span className="vsw-field-name">{field.name}</span>
                  <span className="vsw-field-type">({field.type})</span>
                </label>
              )
            })}
          </div>
        </section>

        <section className="vsw-section">
          <div className="vsw-section-head">
            <strong>Step 2：为已加入字段快速配置组件类型</strong>
            <span className="vsw-muted">仅展示 Step 1 中已经加入视图的字段</span>
          </div>

          {checkedFields.length === 0 ? (
            <div className="vsw-empty">当前还没有加入字段，完成后该视图会保持空状态，可稍后继续添加。</div>
          ) : (
            <div className="vsw-table">
              <div className="vsw-table-head">
                <span>字段名</span>
                <span>字段类型</span>
                <span>组件类型</span>
              </div>
              {checkedFields.map((field) => {
                const options = COMPONENT_OPTIONS_BY_FIELD_TYPE[field.type] ?? ['default']
                const value = componentTypeByFieldId[field.id] ?? 'default'
                return (
                  <div key={field.id} className="vsw-table-row">
                    <span>{field.name}</span>
                    <span>{FIELD_TYPE_LABELS[field.type]}</span>
                    <CustomSelect
                      value={value}
                      onChange={(next) =>
                        setComponentTypeByFieldId((prev) => ({
                          ...prev,
                          [field.id]: (next as FieldComponentType) ?? 'default',
                        }))
                      }
                      options={options.map((componentType) => ({
                        value: componentType,
                        label: COMPONENT_TYPE_LABELS[componentType],
                      }))}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </CustomModal>
  )
}
