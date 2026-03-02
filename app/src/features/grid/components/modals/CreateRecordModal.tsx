import { useState, useMemo } from 'react'
import type { Field, ViewConfig, CascadeRule, ReferenceMember } from '../../types/grid'
import { buildCascadePatch, getOptionsForField } from '../../utils/cascadeRules'
import { confirmAction } from '../../../../utils/confirmAction'
import { CustomModal } from '../CustomModal'
import { CustomSelect } from '../CustomSelect'
import { useGridStore } from '../../store/gridStore'

interface CreateRecordModalProps {
  open: boolean
  onCancel: () => void
  tableId: string
  fields: Field[]
  viewConfig: ViewConfig
  cascadeRules: CascadeRule[]
  tableReferenceMembers: ReferenceMember[]
  onCreateRecord: (tableId: string, initialValues?: Record<string, unknown>) => Promise<void>
}

const isCreateValueEmpty = (fieldType: Field['type'], value: unknown) => {
  if (value == null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (fieldType === 'checkbox') return value !== true
  return false
}

const getCreateRecordValidationError = (
  fields: Field[],
  draft: Record<string, unknown>,
  viewConfig: ViewConfig,
) => {
  const hidden = new Set(viewConfig.hiddenFieldIds ?? [])
  const fieldOrderIds = viewConfig.fieldOrderIds ?? fields.map((field) => field.id)
  const indexMap = new Map(fieldOrderIds.map((id, index) => [id, index]))
  const fieldConfig = viewConfig.formSettings?.fieldConfig ?? {}

  const visibleFields = [...fields]
    .filter((field) => !hidden.has(field.id))
    .sort((a, b) => {
      const ai = indexMap.get(a.id)
      const bi = indexMap.get(b.id)
      return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER)
    })

  for (const field of visibleFields) {
    const config = fieldConfig[field.id] ?? {}
    const label = config.label || field.name
    const value = draft[field.id]
    const required = config.required ?? false

    if (required && isCreateValueEmpty(field.type, value)) {
      return `请填写必填项：${label}`
    }

    if (value == null || value === '') {
      continue
    }

    if (field.type === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
      return `${label} 必须为数字`
    }

    if (field.type === 'date' && Number.isNaN(Date.parse(String(value)))) {
      return `${label} 日期格式无效`
    }
  }

  return null
}

export function CreateRecordModal({
  open,
  onCancel,
  tableId,
  fields,
  viewConfig,
  cascadeRules,
  tableReferenceMembers,
  onCreateRecord,
}: CreateRecordModalProps) {
  const [createDraft, setCreateDraft] = useState<Record<string, unknown>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const setToast = useGridStore((state) => state.setToast)

  const hasDraftChanges = useMemo(
    () =>
      Object.values(createDraft).some((value) => {
        if (value == null) return false
        if (typeof value === 'string') return value.trim().length > 0
        if (Array.isArray(value)) return value.length > 0
        if (typeof value === 'boolean') return value
        return true
      }),
    [createDraft],
  )

  const handleCreateFieldChange = (fieldId: string, value: unknown) => {
    setCreateDraft((prev) => {
      const patch = buildCascadePatch(fields, prev, fieldId, value, cascadeRules, viewConfig.components)
      return { ...prev, ...patch }
    })
  }

  const handleSubmit = async () => {
    await onCreateRecord(tableId, createDraft)
    setCreateDraft({})
    onCancel()
  }
  const handleConfirmSubmit = async () => {
    if (isSubmitting) return
    const validationError = getCreateRecordValidationError(fields, createDraft, viewConfig)
    if (validationError) {
      setToast(validationError, 'warning')
      return
    }
    const confirmed = await confirmAction({
      title: '确认保存新增记录？',
      content: '提交后将创建一条新记录。',
      okText: '确认保存',
    })
    if (!confirmed) return
    setIsSubmitting(true)
    try {
      await handleSubmit()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRequestClose = async () => {
    if (isSubmitting) return
    if (!hasDraftChanges) {
      onCancel()
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的新增记录内容？',
      content: '关闭后当前输入将丢失。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    setCreateDraft({})
    onCancel()
  }

  const viewVisibleFields = useMemo(() => {
    const hidden = new Set(viewConfig.hiddenFieldIds ?? [])
    const fieldOrderIds = viewConfig.fieldOrderIds ?? fields.map((field) => field.id)
    const indexMap = new Map(fieldOrderIds.map((id, index) => [id, index]))
    return [...fields]
      .filter((field) => !hidden.has(field.id))
      .sort((a, b) => {
        const ai = indexMap.get(a.id)
        const bi = indexMap.get(b.id)
        return (ai ?? Number.MAX_SAFE_INTEGER) - (bi ?? Number.MAX_SAFE_INTEGER)
      })
  }, [fields, viewConfig.fieldOrderIds, viewConfig.hiddenFieldIds])

  return (
    <CustomModal
      open={open}
      title="新增记录"
      onCancel={() => void handleRequestClose()}
      onOk={() => void handleConfirmSubmit()}
      okText="保存"
      cancelText="取消"
      width={760}
      confirmLoading={isSubmitting}
      cancelDisabled={isSubmitting}
    >
      <div style={{ display: 'grid', gap: 12, maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
        {viewVisibleFields.length === 0 ? (
          <span className="cm-text-secondary">当前视图无可填写字段。</span>
        ) : (
          viewVisibleFields.map((field) => {
            const componentConfig = viewConfig.components?.[field.id]
            const componentType = componentConfig?.componentType ?? 'default'
            const options =
              field.type === 'singleSelect' || field.type === 'multiSelect'
                ? getOptionsForField(fields, createDraft, field.id, cascadeRules, viewConfig.components)
                : []
            const selectOptions =
              field.type === 'member' || componentType === 'member'
                ? tableReferenceMembers.map((item) => ({ id: item.userId, name: item.username, color: undefined }))
                : componentType === 'select' && componentConfig?.options && componentConfig.options.length > 0
                  ? componentConfig.options
                  : options
            const value = createDraft[field.id]
            return (
              <div key={field.id} className="form-group">
                <label className="form-label">{field.name}</label>
                {field.type === 'singleSelect' || field.type === 'member' || (field.type === 'text' && (componentType === 'select' || componentType === 'member' || componentType === 'cascader')) ? (
                  <CustomSelect
                    value={value == null ? null : String(value)}
                    allowClear
                    placeholder="请选择"
                    onChange={(next) => handleCreateFieldChange(field.id, next)}
                    options={selectOptions.map((item) => ({
                      value: item.id,
                      label: item.color ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                          {item.name}
                        </span>
                      ) : item.name,
                    }))}
                  />
                ) : field.type === 'multiSelect' ? (
                  <CustomSelect
                    multiple
                    value={Array.isArray(value) ? value.map(String) : []}
                    placeholder="请选择"
                    onMultiChange={(next) => handleCreateFieldChange(field.id, next)}
                    options={selectOptions.map((item) => ({ value: item.id, label: item.name }))}
                  />
                ) : field.type === 'checkbox' ? (
                  <label className="cm-checkbox-label">
                    <input
                      type="checkbox"
                      className="cm-checkbox"
                      checked={value === true}
                      onChange={(e) => handleCreateFieldChange(field.id, e.target.checked)}
                    />
                    勾选
                  </label>
                ) : field.type === 'text' && componentType === 'textarea' ? (
                  <textarea
                    className="cm-textarea"
                    value={value == null ? '' : String(value)}
                    placeholder="请输入"
                    rows={3}
                    onChange={(e) => handleCreateFieldChange(field.id, e.target.value)}
                  />
                ) : (
                  <input
                    className="cm-input"
                    type={field.type === 'number' ? 'number' : (field.type === 'date' || componentType === 'date') ? 'datetime-local' : 'text'}
                    value={value == null ? '' : String(value)}
                    placeholder={field.type === 'date' || componentType === 'date' ? '请选择日期' : '请输入'}
                    onChange={(e) => {
                      const next =
                        field.type === 'number'
                          ? (e.target.value === '' ? null : Number(e.target.value))
                          : e.target.value
                      handleCreateFieldChange(field.id, next)
                    }}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </CustomModal>
  )
}
