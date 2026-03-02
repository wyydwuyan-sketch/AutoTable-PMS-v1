import { useMemo, useState } from 'react'
import type { FieldComponentType, FieldType } from '../types/grid'
import {
  COMPONENT_TYPE_LABELS,
  COMPONENT_TYPE_ORDER,
  CONTEXT_LABELS,
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  DisplayPreview,
  EditorPreview,
  buildShowcaseModels,
  type ShowcaseCardModel,
  type ShowcaseContext,
  type ShowcaseVariant,
  type ValueMode,
} from './FieldComponentPreview'
import './ComponentShowcase.css'

function ComponentCard({
  fieldType,
  fieldTypeLabel,
  componentType,
  componentTypeLabel,
  componentTypeDescription,
  renderKind,
  context,
  variant,
  valueMode,
  disabled,
  error,
}: ShowcaseCardModel & {
  context: ShowcaseContext
  variant: ShowcaseVariant
  valueMode: ValueMode
  disabled: boolean
  error: boolean
}) {
  return (
    <article className={`fcs-card fcs-card--${variant}`} tabIndex={0}>
      <header className="fcs-card__header">
        <div className="fcs-card__title-row">
          <span className="fcs-card__type">{componentType}</span>
          <strong>{componentTypeLabel}</strong>
          {variant === 'optimized' ? <span className="fcs-card__badge">优化</span> : null}
        </div>
        <p className="fcs-card__desc">{componentTypeDescription}</p>
        <div className="fcs-card__meta">
          <span>{fieldType}</span>
          <span>{fieldTypeLabel}</span>
        </div>
      </header>

      <div className="fcs-card__section">
        <div className="fcs-card__section-title">展示态（Display）</div>
        <DisplayPreview
          kind={renderKind}
          context={context}
          valueMode={valueMode}
          disabled={disabled}
          error={error}
        />
      </div>

      <div className="fcs-card__section">
        <div className="fcs-card__section-title">编辑态（Edit）</div>
        <EditorPreview
          kind={renderKind}
          context={context}
          variant={variant}
          valueMode={valueMode}
          disabled={disabled}
          error={error}
        />
      </div>

      <div className="fcs-card__section fcs-card__section--compact">
        <div className="fcs-card__section-title">空值对照</div>
        <DisplayPreview
          kind={renderKind}
          context={context}
          valueMode="empty"
          disabled={disabled}
          error={false}
        />
      </div>
    </article>
  )
}

export function ComponentShowcase() {
  const [manualFieldTypeFilter, setManualFieldTypeFilter] = useState<'all' | FieldType>('all')
  const [componentTypeFilter, setComponentTypeFilter] = useState<'all' | FieldComponentType>('all')
  const [variant, setVariant] = useState<ShowcaseVariant>('current')
  const [context, setContext] = useState<ShowcaseContext>('grid')
  const [valueMode, setValueMode] = useState<ValueMode>('filled')
  const [disabled, setDisabled] = useState(false)
  const [error, setError] = useState(false)
  const [isPreviewControlsCollapsed, setIsPreviewControlsCollapsed] = useState(false)

  const sectionModels = useMemo(
    () =>
      FIELD_TYPE_ORDER.map((fieldType) => {
        const cards = buildShowcaseModels(fieldType).filter(
          (card) => componentTypeFilter === 'all' || card.componentType === componentTypeFilter,
        )
        return {
          fieldType,
          fieldTypeLabel: FIELD_TYPE_LABELS[fieldType],
          cards,
        }
      })
        .filter((section) => (manualFieldTypeFilter === 'all' ? true : section.fieldType === manualFieldTypeFilter))
        .filter((section) => section.cards.length > 0),
    [componentTypeFilter, manualFieldTypeFilter],
  )

  const totalVisibleCards = useMemo(
    () => sectionModels.reduce((sum, section) => sum + section.cards.length, 0),
    [sectionModels],
  )

  const previewControlSummary = useMemo(
    () =>
      [
        variant === 'current' ? '当前实现' : '优化版',
        CONTEXT_LABELS[context],
        valueMode === 'filled' ? '有值' : '空值',
        disabled ? '禁用' : '可编辑',
        error ? '错误态' : '正常态',
      ].join(' / '),
    [context, disabled, error, valueMode, variant],
  )

  return (
    <div className={`fcs-page fcs-page--${variant}`}>
      <div className="fcs-header">
        <h3 className="fcs-title">字段组件参考 / Field Component Reference</h3>
        <p className="fcs-subtitle">
          基于 mock 数据浏览各字段组件渲染效果，仅做外观与交互参考，不在此页面直接写入视图配置。
        </p>
      </div>

      <section className="fcs-controls">
        <div className="fcs-control-group">
          <span className="fcs-control-label">字段类型</span>
          <select
            className="fcs-select"
            value={manualFieldTypeFilter}
            onChange={(event) => setManualFieldTypeFilter(event.target.value as 'all' | FieldType)}
          >
            <option value="all">全部字段类型</option>
            {FIELD_TYPE_ORDER.map((fieldType) => (
              <option key={fieldType} value={fieldType}>
                {fieldType} · {FIELD_TYPE_LABELS[fieldType]}
              </option>
            ))}
          </select>
        </div>

        <div className="fcs-control-group">
          <span className="fcs-control-label">组件类型</span>
          <select
            className="fcs-select"
            value={componentTypeFilter}
            onChange={(event) => setComponentTypeFilter(event.target.value as 'all' | FieldComponentType)}
          >
            <option value="all">全部组件类型</option>
            {COMPONENT_TYPE_ORDER.map((componentType) => (
              <option key={componentType} value={componentType}>
                {componentType} · {COMPONENT_TYPE_LABELS[componentType]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className={`fcs-preview-controls${isPreviewControlsCollapsed ? ' is-collapsed' : ''}`}>
        <div className="fcs-preview-controls__bar">
          <div className="fcs-preview-controls__title">预览控制</div>
          <div className="fcs-preview-controls__summary">{previewControlSummary}</div>
          <button
            type="button"
            className="fcs-collapse-btn"
            onClick={() => setIsPreviewControlsCollapsed((current) => !current)}
            aria-expanded={!isPreviewControlsCollapsed}
          >
            {isPreviewControlsCollapsed ? '展开预览控制' : '收起预览控制'}
          </button>
        </div>

        {!isPreviewControlsCollapsed ? (
          <div className="fcs-preview-controls__grid">
            <div className="fcs-control-group">
              <span className="fcs-control-label">样式模式</span>
              <div className="fcs-chip-group">
                {(['current', 'optimized'] as ShowcaseVariant[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`fcs-chip ${variant === item ? 'is-active' : ''}`}
                    onClick={() => setVariant(item)}
                  >
                    {item === 'current' ? '当前实现' : '优化版'}
                  </button>
                ))}
              </div>
            </div>

            <div className="fcs-control-group">
              <span className="fcs-control-label">场景尺寸</span>
              <div className="fcs-chip-group">
                {(['grid', 'drawer', 'form', 'modal'] as ShowcaseContext[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`fcs-chip ${context === item ? 'is-active' : ''}`}
                    onClick={() => setContext(item)}
                  >
                    {CONTEXT_LABELS[item]}
                  </button>
                ))}
              </div>
            </div>

            <div className="fcs-control-group">
              <span className="fcs-control-label">数据状态</span>
              <div className="fcs-chip-group">
                {(['filled', 'empty'] as ValueMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`fcs-chip ${valueMode === item ? 'is-active' : ''}`}
                    onClick={() => setValueMode(item)}
                  >
                    {item === 'filled' ? '有值' : '空值'}
                  </button>
                ))}
              </div>
            </div>

            <div className="fcs-control-group">
              <span className="fcs-control-label">状态开关</span>
              <div className="fcs-toggle-group">
                <label className="fcs-toggle">
                  <input type="checkbox" checked={disabled} onChange={(event) => setDisabled(event.target.checked)} />
                  <span>禁用</span>
                </label>
                <label className="fcs-toggle">
                  <input type="checkbox" checked={error} onChange={(event) => setError(event.target.checked)} />
                  <span>错误</span>
                </label>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div className="fcs-summary">
        <span>共展示 {sectionModels.length} 个字段分组</span>
        <span>组件卡片 {totalVisibleCards} 个</span>
        <span>页面模式：浏览模式</span>
        <span>预览：{previewControlSummary}</span>
      </div>

      <div className="fcs-sections">
        {sectionModels.length === 0 ? (
          <div className="fcs-empty">当前筛选条件下没有可展示的字段组件组合。</div>
        ) : (
          sectionModels.map((section) => (
            <section
              key={section.fieldType}
              id={`fcs-section-${section.fieldType}`}
              className="fcs-field-section"
            >
              <header className="fcs-field-section__header">
                <div className="fcs-field-section__title">
                  <span className="fcs-field-section__code">{section.fieldType}</span>
                  <strong>{section.fieldTypeLabel}字段</strong>
                </div>
                <span className="fcs-field-section__count">{section.cards.length} 种组件渲染</span>
              </header>

              <div className="fcs-card-grid">
                {section.cards.map((card) => (
                  <ComponentCard
                    key={`${card.fieldType}:${card.componentType}`}
                    {...card}
                    context={context}
                    variant={variant}
                    valueMode={valueMode}
                    disabled={disabled}
                    error={error}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
