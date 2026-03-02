import { useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../../grid/api'
import type { Field } from '../../grid/types/grid'
import { useDashboardStore } from '../dashboardStore'
import { dashboardApi } from '../api'
import type { AggregationType, DashboardWidget, DateBucket, WidgetType } from '../types'
import { CustomModal } from '../../grid/components/CustomModal'
import { CustomSelect } from '../../grid/components/CustomSelect'

const WIDGET_TYPES: Array<{ value: WidgetType; label: string; desc: string }> = [
  { value: 'metric', label: '指标卡', desc: '展示聚合值' },
  { value: 'bar', label: '柱状图', desc: '分组对比统计' },
  { value: 'line', label: '折线图', desc: '趋势分析' },
  { value: 'pie', label: '饼图', desc: '占比分布' },
  { value: 'table', label: '数据列表', desc: '记录明细' },
]
const DATE_BUCKET_OPTIONS: Array<{ value: DateBucket; label: string }> = [
  { value: 'day', label: '按日' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
  { value: 'quarter', label: '按季度' },
  { value: 'year', label: '按年' },
]

const isDateBucket = (value: unknown): value is DateBucket =>
  value === 'day' || value === 'week' || value === 'month' || value === 'quarter' || value === 'year'

type FormValues = {
  type: WidgetType
  title: string
  tableId: string
  fieldIds: string[]
  aggregation: AggregationType
  groupFieldId?: string
  config: Record<string, unknown>
}

type Props = {
  open: boolean
  widget: DashboardWidget | null
  defaultTableId: string
  onClose: () => void
}

export function WidgetEditor({ open, widget, defaultTableId, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [fields, setFields] = useState<Field[]>([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [tableOptions, setTableOptions] = useState<Array<{ value: string; label: string }>>([])
  const addWidget = useDashboardStore((state) => state.addWidget)
  const updateWidget = useDashboardStore((state) => state.updateWidget)

  const isEdit = !!widget

  const typeLabelMap = useMemo(
    () => Object.fromEntries(WIDGET_TYPES.map((item) => [item.value, item.label] as const)),
    [],
  )

  // form values as controlled state
  const [formType, setFormType] = useState<WidgetType>('metric')
  const [formTitle, setFormTitle] = useState('')
  const [formTableId, setFormTableId] = useState(defaultTableId)
  const [formFieldIds, setFormFieldIds] = useState<string[]>([])
  const [formAggregation, setFormAggregation] = useState<AggregationType>('count')
  const [formGroupFieldId, setFormGroupFieldId] = useState<string | undefined>()
  const [formDateBucket, setFormDateBucket] = useState<DateBucket>('month')

  const numericFieldOptions = useMemo(
    () => fields.filter((field) => field.type === 'number').map((field) => ({ value: field.id, label: field.name })),
    [fields],
  )
  const groupFieldOptions = useMemo(
    () =>
      fields
        .filter((field) => ['singleSelect', 'text', 'date'].includes(field.type))
        .map((field) => ({ value: field.id, label: field.name })),
    [fields],
  )
  const allFieldOptions = useMemo(
    () => fields.map((field) => ({ value: field.id, label: `${field.name} (${field.type})` })),
    [fields],
  )
  const selectedGroupField = useMemo(
    () => fields.find((field) => field.id === formGroupFieldId),
    [fields, formGroupFieldId],
  )

  useEffect(() => {
    if (!open) return
    const fallbackType: WidgetType = widget?.type ?? 'metric'
    const fallbackTitle = widget?.title ?? typeLabelMap[fallbackType]
    const fallbackTableId = widget?.tableId ?? defaultTableId
    setFormType(fallbackType)
    setFormTitle(fallbackTitle)
    setFormTableId(fallbackTableId)
    setFormFieldIds(widget?.fieldIds ?? [])
    setFormAggregation(widget?.aggregation ?? 'count')
    setFormGroupFieldId(widget?.groupFieldId ?? undefined)
    const rawDateBucket = widget?.config?.['dateBucket']
    setFormDateBucket(isDateBucket(rawDateBucket) ? rawDateBucket : 'month')
    setStep(isEdit ? 1 : 0)
  }, [defaultTableId, isEdit, open, typeLabelMap, widget])

  useEffect(() => {
    if (!open) return
    let active = true
    void (async () => {
      try {
        const tables = await dashboardApi.getTables()
        if (!active) return
        const options = tables.map((item) => ({
          value: item.id,
          label: `${item.name} (${item.id})`,
        }))
        setTableOptions(options)
      } catch {
        if (!active) return
        setTableOptions([{ value: defaultTableId, label: defaultTableId }])
      }
    })()
    return () => {
      active = false
    }
  }, [defaultTableId, open])

  useEffect(() => {
    if (!open || tableOptions.length === 0) return
    const hasCurrentValue = tableOptions.some((item) => item.value === formTableId)
    if (hasCurrentValue) return
    const fallback = tableOptions.find((item) => item.value === defaultTableId) ?? tableOptions[0]
    if (fallback) {
      setFormTableId(fallback.value)
    }
  }, [defaultTableId, formTableId, open, tableOptions])

  useEffect(() => {
    if (!open) return
    if (!formTableId) {
      setFields([])
      return
    }
    let active = true
    setFieldsLoading(true)
    void (async () => {
      try {
        const result = await gridApiClient.getFields(formTableId)
        if (!active) return
        setFields(result)
      } catch {
        if (!active) return
        setFields([])
      } finally {
        if (active) {
          setFieldsLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [open, formTableId])

  const handleNext = () => {
    if (step === 0 && !formType) return
    if (step === 1 && !formTableId) return
    setStep((prev) => Math.min(prev + 1, 2))
  }

  const handleSave = async () => {
    if (!formTitle.trim()) return
    const nextConfig: Record<string, unknown> = { ...(widget?.config ?? {}) }
    if (selectedGroupField?.type === 'date') {
      nextConfig['dateBucket'] = formDateBucket
    } else {
      delete nextConfig['dateBucket']
    }
    const values: FormValues = {
      type: formType,
      title: formTitle,
      tableId: formTableId,
      fieldIds: formFieldIds,
      aggregation: formAggregation,
      groupFieldId: formGroupFieldId,
      config: nextConfig,
    }
    if (isEdit && widget) {
      await updateWidget(widget.id, {
        title: values.title,
        tableId: values.tableId,
        fieldIds: values.fieldIds ?? [],
        aggregation: values.aggregation,
        groupFieldId: values.groupFieldId ?? null,
        config: values.config,
      })
      onClose()
      return
    }
    await addWidget({
      type: values.type,
      title: values.title || typeLabelMap[values.type],
      tableId: values.tableId,
      fieldIds: values.fieldIds ?? [],
      aggregation: values.aggregation,
      groupFieldId: values.groupFieldId ?? null,
      layout: { x: 0, y: 999, w: 4, h: 3 },
      config: values.config,
    })
    onClose()
  }

  const closeAndReset = () => {
    setStep(0)
    setFormType('metric')
    setFormTitle('')
    setFormTableId(defaultTableId)
    setFormFieldIds([])
    setFormAggregation('count')
    setFormGroupFieldId(undefined)
    setFormDateBucket('month')
    onClose()
  }

  const stepLabels = ['选择类型', '配置数据源', '设置标题']

  return (
    <CustomModal
      open={open}
      title={isEdit ? '编辑组件' : '添加组件'}
      onCancel={closeAndReset}
      footer={null}
      width={640}
    >
      {/* Steps indicator */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {stepLabels.map((label, i) => (
          <div key={label} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
              fontSize: 13, fontWeight: 600,
              background: i <= step ? 'var(--primary)' : 'var(--bg-hover)',
              color: i <= step ? '#fff' : 'var(--text-muted)',
              transition: 'all 0.2s ease',
            }}>
              {i + 1}
            </div>
            <div style={{ fontSize: 12, color: i <= step ? 'var(--text-main)' : 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {step === 0 ? (
        <div className="form-group">
          <label className="form-label">组件类型</label>
          <div className="cm-segmented" style={{ flexWrap: 'wrap' }}>
            {WIDGET_TYPES.map((item) => (
              <button
                key={item.value}
                className={`cm-segmented-item${formType === item.value ? ' cm-segmented-item--active' : ''}`}
                onClick={() => setFormType(item.value)}
                title={item.desc}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <div className="form-group">
            <label className="form-label">数据表</label>
            <CustomSelect
              value={formTableId}
              onChange={(value) => setFormTableId((value ?? defaultTableId) as string)}
              options={tableOptions.length > 0 ? tableOptions : [{ value: defaultTableId, label: defaultTableId }]}
            />
          </div>

          {fieldsLoading ? (
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <div className="cm-skeleton" style={{ height: 16, width: '60%' }} />
              <div className="cm-skeleton" style={{ height: 16, width: '80%' }} />
              <div className="cm-skeleton" style={{ height: 16, width: '40%' }} />
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label">聚合方式</label>
            <CustomSelect
              value={formAggregation}
              onChange={(value) => setFormAggregation((value ?? 'count') as AggregationType)}
              options={[
                { value: 'count', label: '计数' },
                { value: 'sum', label: '求和' },
                { value: 'avg', label: '平均值' },
              ]}
            />
          </div>

          {formType === 'metric' ? (
            <div className="form-group">
              <label className="form-label">数值字段（用于求和/平均）</label>
              <CustomSelect multiple value={formFieldIds} onMultiChange={setFormFieldIds} options={numericFieldOptions} placeholder="可选，不选时默认按记录数计数" />
            </div>
          ) : null}

          {formType === 'bar' || formType === 'pie' || formType === 'line' ? (
            <>
              <div className="form-group">
                <label className="form-label">分组字段</label>
                <CustomSelect value={formGroupFieldId ?? null} onChange={(value) => setFormGroupFieldId(value as string | undefined)} options={groupFieldOptions} placeholder="请选择分组字段" allowClear />
              </div>
              {selectedGroupField?.type === 'date' ? (
                <div className="form-group">
                  <label className="form-label">日期粒度</label>
                  <CustomSelect
                    value={formDateBucket}
                    onChange={(value) => setFormDateBucket((value ?? 'month') as DateBucket)}
                    options={DATE_BUCKET_OPTIONS}
                  />
                </div>
              ) : null}
              <div className="form-group">
                <label className="form-label">数值字段（用于 sum/avg）</label>
                <CustomSelect multiple value={formFieldIds} onMultiChange={setFormFieldIds} options={numericFieldOptions} placeholder="可选，count 时可不选" />
              </div>
            </>
          ) : null}

          {formType === 'table' ? (
            <div className="form-group">
              <label className="form-label">展示字段</label>
              <CustomSelect multiple value={formFieldIds} onMultiChange={setFormFieldIds} options={allFieldOptions} placeholder="不选则展示全部字段" />
            </div>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'color-mix(in srgb, var(--primary) 8%, var(--bg-panel))', border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)', fontSize: 13, color: 'var(--text-main)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>ℹ️</span> 建议标题简洁且可识别，例如：任务状态分布、本周新增工单。
          </div>
          <div className="form-group">
            <label className="form-label">组件标题</label>
            <input
              className="cm-input"
              maxLength={30}
              placeholder="请输入组件标题"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
          </div>
        </>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        {step > 0 ? <button className="cm-btn" onClick={() => setStep((prev) => prev - 1)}>上一步</button> : null}
        {step < 2 ? (
          <button className="cm-btn cm-btn--primary" onClick={handleNext}>
            下一步
          </button>
        ) : (
          <button className="cm-btn cm-btn--primary" onClick={() => void handleSave()}>
            保存
          </button>
        )}
      </div>
    </CustomModal>
  )
}
