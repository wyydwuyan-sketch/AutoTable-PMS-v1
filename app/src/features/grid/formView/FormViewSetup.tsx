import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomSelect } from '../components/CustomSelect'
import { useGridStore } from '../store/gridStore'
import type { CascadeRule, FieldType } from '../types/grid'

const createRuleId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `form_rule_${crypto.randomUUID()}`
  }
  return `form_rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function FormViewSetup() {
  const navigate = useNavigate()
  const { baseId = 'base_1', tableId = 'tbl_1', viewId = 'viw_1' } = useParams()
  const fields = useGridStore((state) => state.fields)
  const viewConfig = useGridStore((state) => state.viewConfig)
  const updateViewConfig = useGridStore((state) => state.updateViewConfig)
  const createField = useGridStore((state) => state.createField)

  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldType>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')

  const formSettings = viewConfig.formSettings || {}
  const visibleFieldIds = formSettings.visibleFieldIds ?? []
  const cascadeRules = formSettings.cascadeRules ?? []
  const singleSelectFields = useMemo(() => fields.filter((field) => field.type === 'singleSelect'), [fields])

  const setFormSettings = (patch: Partial<NonNullable<typeof formSettings>>) => {
    updateViewConfig({
      formSettings: {
        ...formSettings,
        ...patch,
      },
    })
  }

  const toggleVisibleField = (fieldId: string) => {
    const next = visibleFieldIds.includes(fieldId)
      ? visibleFieldIds.filter((id) => id !== fieldId)
      : [...visibleFieldIds, fieldId]
    setFormSettings({ visibleFieldIds: next })
  }

  const addRule = () => {
    if (singleSelectFields.length < 2) return
    const parentFieldId = singleSelectFields[0].id
    const childFieldId = singleSelectFields[1].id
    const nextRule: CascadeRule = {
      id: createRuleId(),
      name: `表单规则 ${cascadeRules.length + 1}`,
      parentFieldId,
      childFieldId,
      enabled: true,
      order: cascadeRules.length,
    }
    setFormSettings({ cascadeRules: [...cascadeRules, nextRule] })
  }

  const updateRule = (ruleId: string, patch: Partial<CascadeRule>) => {
    const next = cascadeRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule))
    setFormSettings({ cascadeRules: next })
  }

  const removeRule = (ruleId: string) => {
    const next = cascadeRules
      .filter((rule) => rule.id !== ruleId)
      .map((rule, index) => ({ ...rule, order: index }))
    setFormSettings({ cascadeRules: next })
  }

  const moveRule = (ruleId: string, direction: 'up' | 'down') => {
    const sorted = [...cascadeRules].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex((rule) => rule.id === ruleId)
    if (idx < 0) return
    const target = direction === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= sorted.length) return
      ;[sorted[idx], sorted[target]] = [sorted[target], sorted[idx]]
    setFormSettings({ cascadeRules: sorted.map((rule, index) => ({ ...rule, order: index })) })
  }

  const handleCreateField = async () => {
    const name = newFieldName.trim()
    if (!name) return
    const options =
      newFieldType === 'singleSelect' || newFieldType === 'multiSelect'
        ? newFieldOptions
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => ({ id: item, name: item }))
        : undefined
    await createField(tableId, name, newFieldType, options)
    const latest = useGridStore.getState().fields
    const created = latest[latest.length - 1]
    if (created) {
      setFormSettings({ visibleFieldIds: [...visibleFieldIds, created.id] })
    }
    setNewFieldName('')
    setNewFieldType('text')
    setNewFieldOptions('')
  }

  return (
    <div className="grid-root" style={{ padding: 24, overflowY: 'auto' }}>
      <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 18, fontWeight: 600 }}>表单视图配置</h4>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
        新建表单默认空白。在这里配置字段、字段类型，并设置下拉引用规则。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <section>
          <h3 style={{ marginBottom: 12 }}>字段配置</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              className="cm-input"
              placeholder="字段名称"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              style={{ flex: 1 }}
            />
            <CustomSelect
              value={newFieldType}
              onChange={(value) => setNewFieldType((value ?? 'text') as FieldType)}
              style={{ width: 150 }}
              options={[
                { value: 'text', label: '文本' },
                { value: 'number', label: '数字' },
                { value: 'date', label: '日期' },
                { value: 'singleSelect', label: '单选' },
                { value: 'multiSelect', label: '多选' },
                { value: 'member', label: '成员' },
                { value: 'checkbox', label: '复选框' },
                { value: 'attachment', label: '附件' },
                { value: 'image', label: '图片' },
              ]}
            />
            <button className="cm-btn" onClick={() => void handleCreateField()}>新增字段</button>
          </div>
          {(newFieldType === 'singleSelect' || newFieldType === 'multiSelect') ? (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">预设选项（逗号或换行分隔）</label>
              <textarea
                className="cm-textarea"
                style={{ minHeight: 88, padding: 8 }}
                value={newFieldOptions}
                onChange={(e) => setNewFieldOptions(e.target.value)}
                placeholder={'例如：\n待处理\n进行中\n已完成'}
              />
            </div>
          ) : null}
          <div style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12, maxHeight: 360, overflowY: 'auto' }}>
            {fields.map((field) => (
              <label key={field.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <input type="checkbox" className="cm-checkbox" checked={visibleFieldIds.includes(field.id)} onChange={() => toggleVisibleField(field.id)} />
                <span>{field.name}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({field.type})</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3 style={{ marginBottom: 12 }}>下拉引用配置</h3>
          <div style={{ marginBottom: 12 }}>
            <button className="cm-btn" onClick={addRule} disabled={singleSelectFields.length < 2}>
              新增引用规则
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 360, overflowY: 'auto' }}>
            {cascadeRules.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>暂无引用规则</div>
            ) : (
              [...cascadeRules]
                .sort((a, b) => a.order - b.order)
                .map((rule, index, sorted) => {
                  const childCandidates = singleSelectFields.filter((field) => field.id !== rule.parentFieldId)
                  return (
                    <div key={rule.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <strong>规则 {index + 1}</strong>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="cm-btn cm-btn--sm" onClick={() => moveRule(rule.id, 'up')} disabled={index === 0}>上移</button>
                          <button className="cm-btn cm-btn--sm" onClick={() => moveRule(rule.id, 'down')} disabled={index === sorted.length - 1}>下移</button>
                          <button className="cm-btn cm-btn--sm" onClick={() => removeRule(rule.id)}>删除</button>
                        </div>
                      </div>
                      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <input type="checkbox" className="cm-checkbox" checked={rule.enabled} onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })} />
                        启用
                      </label>
                      <div className="form-group">
                        <label className="form-label">父字段</label>
                        <CustomSelect
                          value={rule.parentFieldId}
                          onChange={(nextParent) => {
                            const nextChild =
                              childCandidates.find((field) => field.id !== (nextParent as string) && field.id === rule.childFieldId)?.id ??
                              singleSelectFields.find((field) => field.id !== (nextParent as string))?.id ??
                              ''
                            updateRule(rule.id, { parentFieldId: nextParent as string, childFieldId: nextChild })
                          }}
                          options={singleSelectFields.map((field) => ({ value: field.id, label: field.name }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">子字段</label>
                        <CustomSelect
                          value={rule.childFieldId}
                          onChange={(value) => updateRule(rule.id, { childFieldId: value as string })}
                          options={childCandidates.map((field) => ({ value: field.id, label: field.name }))}
                        />
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </section>
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="cm-btn" onClick={() => navigate(`/b/${baseId}/t/${tableId}/v/${viewId}/form`)}>完成并进入表单视图</button>
      </div>
    </div>
  )
}
