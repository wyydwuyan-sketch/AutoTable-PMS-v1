import { useCallback, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import type { FieldComponentType, FieldType } from '../types/grid'

export type ShowcaseVariant = 'current' | 'optimized'
export type ShowcaseContext = 'grid' | 'drawer' | 'form' | 'modal'
export type ValueMode = 'filled' | 'empty'

export type FieldComponentKind =
  | 'text'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'member'
  | 'cascader'
  | 'multiSelect'
  | 'checkbox'
  | 'upload'
  | 'image'

export type SelectOption = {
  id: string
  name: string
  color?: string
}

export type ShowcaseCardModel = {
  fieldType: FieldType
  fieldTypeLabel: string
  componentType: FieldComponentType
  componentTypeLabel: string
  componentTypeDescription: string
  renderKind: FieldComponentKind
}

export const FIELD_TYPE_ORDER: FieldType[] = [
  'text',
  'number',
  'date',
  'singleSelect',
  'multiSelect',
  'checkbox',
  'attachment',
  'image',
  'member',
]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: '文本',
  number: '数字',
  date: '日期',
  singleSelect: '单选',
  multiSelect: '多选',
  checkbox: '复选框',
  attachment: '附件',
  image: '图片',
  member: '成员',
}

export const COMPONENT_TYPE_ORDER: FieldComponentType[] = [
  'default',
  'input',
  'textarea',
  'date',
  'select',
  'member',
  'cascader',
  'upload',
  'image',
]

export const COMPONENT_TYPE_LABELS: Record<FieldComponentType, string> = {
  default: '默认',
  input: '文本输入',
  textarea: '文本域',
  date: '日期选择',
  select: '下拉选择',
  member: '成员选择',
  cascader: '级联下拉',
  upload: '附件上传',
  image: '图片上传',
}

export const COMPONENT_TYPE_DESCRIPTIONS: Record<FieldComponentType, string> = {
  default: '按字段类型自动选择渲染方式',
  input: '单行输入，适合短文本与紧凑编辑',
  textarea: '多行输入，适合备注/描述类内容',
  date: '日期时间输入，用于时间类字段',
  select: '固定选项下拉，支持颜色标签展示',
  member: '成员选择，下拉展示成员名称',
  cascader: '父子联动选择，适合级联场景',
  upload: '文件上传输入，用于附件字段',
  image: '图片上传输入，限制图片文件',
}

export const COMPONENT_OPTIONS_BY_FIELD_TYPE: Record<FieldType, FieldComponentType[]> = {
  text: ['default', 'input', 'textarea', 'date', 'select', 'member', 'cascader'],
  number: ['default', 'input'],
  date: ['default', 'date', 'input'],
  singleSelect: ['default', 'select', 'member', 'cascader'],
  multiSelect: ['default', 'textarea'],
  checkbox: ['default'],
  attachment: ['default', 'upload'],
  image: ['default', 'image', 'upload'],
  member: ['default', 'member'],
}

export const CONTEXT_LABELS: Record<ShowcaseContext, string> = {
  grid: 'Grid',
  drawer: 'Drawer',
  form: 'Form',
  modal: 'Modal',
}

export const COLOR_OPTIONS: SelectOption[] = [
  { id: 'todo', name: '待处理', color: '#94a3b8' },
  { id: 'doing', name: '进行中', color: '#3b82f6' },
  { id: 'done', name: '已完成', color: '#10b981' },
  { id: 'risk', name: '高风险', color: '#ef4444' },
]

export const MEMBER_OPTIONS: SelectOption[] = [
  { id: 'u_1', name: '王小明' },
  { id: 'u_2', name: '李小雨' },
  { id: 'u_3', name: '陈思远' },
]

export const CASCADER_PARENT_OPTIONS: SelectOption[] = [
  { id: 'phase_a', name: '准备阶段', color: '#f59e0b' },
  { id: 'phase_b', name: '实施阶段', color: '#3b82f6' },
]

export const CASCADER_CHILD_OPTIONS_BY_PARENT: Record<string, SelectOption[]> = {
  phase_a: [
    { id: 'todo', name: '待开始', color: '#94a3b8' },
    { id: 'accepted', name: '已受理', color: '#06b6d4' },
  ],
  phase_b: [
    { id: 'connecting', name: '数据对接中', color: '#3b82f6' },
    { id: 'online', name: '已上线', color: '#10b981' },
  ],
}

export const buildRenderKind = (fieldType: FieldType, componentType: FieldComponentType): FieldComponentKind => {
  if (fieldType === 'number') return 'number'
  if (fieldType === 'date') return componentType === 'input' ? 'text' : 'date'
  if (fieldType === 'singleSelect') {
    if (componentType === 'member') return 'member'
    if (componentType === 'cascader') return 'cascader'
    return 'select'
  }
  if (fieldType === 'multiSelect') {
    return componentType === 'textarea' ? 'textarea' : 'multiSelect'
  }
  if (fieldType === 'checkbox') return 'checkbox'
  if (fieldType === 'attachment') return 'upload'
  if (fieldType === 'image') return componentType === 'upload' ? 'upload' : 'image'
  if (fieldType === 'member') return 'member'

  if (fieldType === 'text') {
    if (componentType === 'textarea') return 'textarea'
    if (componentType === 'date') return 'date'
    if (componentType === 'select') return 'select'
    if (componentType === 'member') return 'member'
    if (componentType === 'cascader') return 'cascader'
    if (componentType === 'upload') return 'upload'
    if (componentType === 'image') return 'image'
    return 'text'
  }

  return 'text'
}

export const getFilledDisplayValue = (kind: FieldComponentKind) => {
  switch (kind) {
    case 'number':
      return '128'
    case 'date':
      return '2026-02-26 09:30'
    case 'textarea':
      return '这是一个多行文本示例，用于展示备注和说明类字段。'
    case 'select':
      return COLOR_OPTIONS[1]
    case 'member':
      return MEMBER_OPTIONS[1]
    case 'cascader':
      return {
        parent: CASCADER_PARENT_OPTIONS[1],
        child: CASCADER_CHILD_OPTIONS_BY_PARENT.phase_b[0],
      }
    case 'multiSelect':
      return [COLOR_OPTIONS[1], COLOR_OPTIONS[2]]
    case 'checkbox':
      return true
    case 'upload':
      return { count: 2, label: '2 个文件' }
    case 'image':
      return { count: 3, label: '3 张图片' }
    default:
      return '示例文本内容'
  }
}

export const buildShowcaseModels = (fieldType: FieldType): ShowcaseCardModel[] => {
  const allowed = COMPONENT_OPTIONS_BY_FIELD_TYPE[fieldType] ?? []
  return COMPONENT_TYPE_ORDER
    .filter((componentType) => allowed.includes(componentType))
    .map((componentType) => ({
      fieldType,
      fieldTypeLabel: FIELD_TYPE_LABELS[fieldType],
      componentType,
      componentTypeLabel: COMPONENT_TYPE_LABELS[componentType],
      componentTypeDescription: COMPONENT_TYPE_DESCRIPTIONS[componentType],
      renderKind: buildRenderKind(fieldType, componentType),
    }))
}

export const TagPill = ({ option }: { option: SelectOption }) => (
  <span className="field-widget__tag" style={option.color ? ({ '--tag-color': option.color } as CSSProperties) : undefined}>
    {option.color ? <span className="field-widget__tag-dot" /> : null}
    {option.name}
  </span>
)

export const DisplayPreview = ({
  kind,
  context,
  valueMode,
  disabled,
  error,
  selectOptionsOverride,
}: {
  kind: FieldComponentKind
  context: ShowcaseContext
  valueMode: ValueMode
  disabled: boolean
  error: boolean
  selectOptionsOverride?: SelectOption[]
}) => {
  const isEmpty = valueMode === 'empty'
  const effectiveSelectOptions = selectOptionsOverride && selectOptionsOverride.length > 0 ? selectOptionsOverride : COLOR_OPTIONS
  const filledValue =
    kind === 'select'
      ? (effectiveSelectOptions[1] ?? effectiveSelectOptions[0] ?? COLOR_OPTIONS[0])
      : getFilledDisplayValue(kind)
  const className = [
    'field-widget',
    'field-widget--display',
    `field-widget--${context}`,
    disabled ? 'field-widget--disabled' : '',
    error ? 'field-widget--error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  let content: ReactNode
  if (isEmpty) {
    content = <span className="field-widget__placeholder">空值 / 未填写</span>
  } else if (kind === 'select' || kind === 'member') {
    content = <TagPill option={filledValue as SelectOption} />
  } else if (kind === 'cascader') {
    const cascaderValue = filledValue as { parent: SelectOption; child: SelectOption }
    content = (
      <div className="field-widget__stack">
        <TagPill option={cascaderValue.parent} />
        <TagPill option={cascaderValue.child} />
      </div>
    )
  } else if (kind === 'multiSelect') {
    content = isEmpty ? (
      <span className="field-widget__placeholder">空值 / 未填写</span>
    ) : (
      <div className="field-widget__stack field-widget__stack--row">
        {(filledValue as SelectOption[]).map((item) => <TagPill key={item.id} option={item} />)}
      </div>
    )
  } else if (kind === 'checkbox') {
    content = (
      <label className="field-widget__checkbox-inline">
        <input type="checkbox" checked={filledValue === true} readOnly disabled={disabled} />
        <span>{filledValue === true ? '已勾选' : '未勾选'}</span>
      </label>
    )
  } else if (kind === 'upload' || kind === 'image') {
    const meta = filledValue as { count: number; label: string }
    content = (
      <div className="field-widget__file-meta">
        <span className="field-widget__file-chip">{meta.label}</span>
      </div>
    )
  } else {
    content = <span className="field-widget__text">{String(filledValue)}</span>
  }

  return (
    <div className={className}>
      <div className="field-widget__input">{content}</div>
      {error ? <div className="field-widget__error">示例错误提示：请输入合法值</div> : null}
    </div>
  )
}

export const EditorPreview = ({
  kind,
  context,
  variant,
  valueMode,
  disabled,
  error,
  selectOptionsOverride,
}: {
  kind: FieldComponentKind
  context: ShowcaseContext
  variant: ShowcaseVariant
  valueMode: ValueMode
  disabled: boolean
  error: boolean
  selectOptionsOverride?: SelectOption[]
}) => {
  const isEmpty = valueMode === 'empty'
  const widgetKey = `${kind}-${context}-${variant}-${valueMode}-${disabled ? 1 : 0}-${error ? 1 : 0}`
  const widgetClassName = [
    'field-widget',
    `field-widget--${context}`,
    disabled ? 'field-widget--disabled' : '',
    error ? 'field-widget--error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const commonInputClass = 'field-widget__control'

  let control: ReactNode
  if (kind === 'text') {
    control = (
      <input
        key={widgetKey}
        className={commonInputClass}
        type="text"
        defaultValue={isEmpty ? '' : '示例文本内容'}
        placeholder="请输入文本"
        disabled={disabled}
      />
    )
  } else if (kind === 'number') {
    control = (
      <input
        key={widgetKey}
        className={commonInputClass}
        type="number"
        defaultValue={isEmpty ? '' : '128'}
        placeholder="请输入数字"
        disabled={disabled}
      />
    )
  } else if (kind === 'date') {
    control = (
      <input
        key={widgetKey}
        className={commonInputClass}
        type="datetime-local"
        defaultValue={isEmpty ? '' : '2026-02-26T09:30'}
        disabled={disabled}
      />
    )
  } else if (kind === 'textarea') {
    control = (
      <textarea
        key={widgetKey}
        className={`${commonInputClass} field-widget__control--textarea`}
        defaultValue={isEmpty ? '' : '这是一个多行文本示例，用于模拟备注字段的编辑态。'}
        placeholder="请输入内容"
        disabled={disabled}
      />
    )
  } else if (kind === 'select' || kind === 'member') {
    const options = kind === 'member'
      ? MEMBER_OPTIONS
      : (selectOptionsOverride && selectOptionsOverride.length > 0 ? selectOptionsOverride : COLOR_OPTIONS)
    const selected = isEmpty ? '' : options[1]?.id ?? ''
    const selectedOption = options.find((item) => item.id === selected)
    const accentStyle: CSSProperties | undefined = selectedOption?.color
      ? {
        background: `${selectedOption.color}1a`,
        color: selectedOption.color,
        borderColor: `${selectedOption.color}66`,
      }
      : undefined
    control = (
      <select
        key={widgetKey}
        className={commonInputClass}
        defaultValue={selected}
        disabled={disabled}
        style={accentStyle}
      >
        <option value="">请选择</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    )
  } else if (kind === 'cascader') {
    control = (
      <CascaderEditorPreview
        key={widgetKey}
        isEmpty={isEmpty}
        disabled={disabled}
        inputClassName={commonInputClass}
      />
    )
  } else if (kind === 'multiSelect') {
    control = (
      <MultiSelectEditorPreview
        key={widgetKey}
        isEmpty={isEmpty}
        disabled={disabled}
      />
    )
  } else if (kind === 'checkbox') {
    control = (
      <label key={widgetKey} className="field-widget__checkbox-inline">
        <input type="checkbox" defaultChecked={!isEmpty} disabled={disabled} />
        <span>{isEmpty ? '未勾选' : '已勾选'}</span>
      </label>
    )
  } else if (kind === 'upload' || kind === 'image') {
    control = (
      <div key={widgetKey} className="field-widget__upload">
        <input
          className={commonInputClass}
          type="file"
          multiple={kind === 'upload'}
          accept={kind === 'image' ? 'image/*' : undefined}
          disabled={disabled}
        />
        <span className="field-widget__hint">
          {isEmpty ? (kind === 'image' ? '未选择图片' : '未选择文件') : (kind === 'image' ? '模拟已选择 3 张图片' : '模拟已选择 2 个文件')}
        </span>
      </div>
    )
  } else {
    control = (
      <input
        key={widgetKey}
        className={commonInputClass}
        type="text"
        defaultValue={isEmpty ? '' : '示例文本内容'}
        placeholder="请输入文本"
        disabled={disabled}
      />
    )
  }

  return (
    <div className={widgetClassName}>
      <div className="field-widget__input">{control}</div>
      {error ? <div className="field-widget__error">示例错误提示：当前输入不符合校验规则</div> : null}
    </div>
  )
}

function CascaderEditorPreview({
  isEmpty,
  disabled,
  inputClassName,
}: {
  isEmpty: boolean
  disabled: boolean
  inputClassName: string
}) {
  const initialParent = isEmpty ? '' : CASCADER_PARENT_OPTIONS[1].id
  const [localParent, setLocalParent] = useState(initialParent)
  const childOptions = localParent ? CASCADER_CHILD_OPTIONS_BY_PARENT[localParent] ?? [] : []
  const initialChild = isEmpty ? '' : childOptions[0]?.id ?? ''
  const [localChild, setLocalChild] = useState(initialChild)

  const handleParentChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value
    setLocalParent(next)
    setLocalChild('')
  }, [])

  return (
    <div className="field-widget__cascader">
      <select className={inputClassName} value={localParent} onChange={handleParentChange} disabled={disabled}>
        <option value="">请选择父级</option>
        {CASCADER_PARENT_OPTIONS.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
      <select className={inputClassName} value={localChild} onChange={(event) => setLocalChild(event.target.value)} disabled={disabled || !localParent}>
        <option value="">请选择子级</option>
        {childOptions.map((item) => (
          <option key={item.id} value={item.id}>{item.name}</option>
        ))}
      </select>
    </div>
  )
}

function MultiSelectEditorPreview({
  isEmpty,
  disabled,
}: {
  isEmpty: boolean
  disabled: boolean
}) {
  const initialSelected = isEmpty ? [] as string[] : [COLOR_OPTIONS[0].id, COLOR_OPTIONS[2].id]
  const [selected, setSelected] = useState<string[]>(initialSelected)

  const toggle = useCallback((id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }, [])

  return (
    <div className="field-widget__multi-chips">
      {COLOR_OPTIONS.map((item) => {
        const isActive = selected.includes(item.id)
        return (
          <button
            key={item.id}
            type="button"
            className={`field-widget__multi-chip ${isActive ? 'is-active' : ''}`}
            style={item.color ? ({ '--tag-color': item.color } as CSSProperties) : undefined}
            disabled={disabled}
            onClick={() => toggle(item.id)}
          >
            {item.color ? <span className="field-widget__tag-dot" /> : null}
            {item.name}
          </button>
        )
      })}
    </div>
  )
}
