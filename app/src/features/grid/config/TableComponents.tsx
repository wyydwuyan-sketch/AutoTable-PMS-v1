import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AppstoreOutlined, PlusOutlined } from '@ant-design/icons'
import { DropdownMenu } from '../components/DropdownMenu'
import { CustomModal } from '../components/CustomModal'
import { CustomSelect } from '../components/CustomSelect'
import { useGridStore } from '../store/gridStore'
import type { Field, FieldComponentConfig, FieldComponentType, FieldOption, FieldType, ReferenceMember, View, ViewConfig } from '../types/grid'
import { gridApiClient } from '../api'
import { confirmAction } from '../../../utils/confirmAction'
import { tableItems } from '../../../config/tables'
import { useMultiTableFields } from '../../../app/hooks/useMultiTableFields'
import { useMultiTableViews } from '../../../app/hooks/useMultiTableViews'
import { ViewSetupWizard } from './ViewSetupWizard'
import { buildShowcaseModels, DisplayPreview, EditorPreview } from './FieldComponentPreview'
import './ComponentShowcase.css'
import './TableComponents.css'

const componentTypeOptions: Array<{ value: FieldComponentType; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'input', label: '文本输入' },
  { value: 'textarea', label: '文本域' },
  { value: 'date', label: '日期选择' },
  { value: 'select', label: '下拉选择' },
  { value: 'member', label: '成员选择' },
  { value: 'cascader', label: '级联下拉' },
  { value: 'upload', label: '附件上传' },
  { value: 'image', label: '图片上传' },
]

const componentOptionsByFieldType: Partial<Record<string, FieldComponentType[]>> = {
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

const fieldTypeOptions: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'singleSelect', label: '单选' },
  { value: 'multiSelect', label: '多选' },
  { value: 'member', label: '成员' },
  { value: 'checkbox', label: '复选框' },
  { value: 'attachment', label: '附件' },
  { value: 'image', label: '图片' },
]

const colorPresets: Array<{ label: string; value: string }> = [
  { label: '红色', value: '#ef4444' },
  { label: '橙色', value: '#f97316' },
  { label: '琥珀', value: '#f59e0b' },
  { label: '黄色', value: '#eab308' },
  { label: '绿色', value: '#22c55e' },
  { label: '青色', value: '#06b6d4' },
  { label: '蓝色', value: '#3b82f6' },
  { label: '紫色', value: '#8b5cf6' },
  { label: '粉色', value: '#ec4899' },
  { label: '灰色', value: '#64748b' },
]

const toOptionRows = (options?: FieldOption[]) =>
  (options ?? []).map((item) => ({ name: item.name, color: item.color ?? '' }))

const toFieldOptions = (rows: Array<{ name: string; color: string }>): FieldOption[] =>
  rows
    .map((row) => ({ name: row.name.trim(), color: row.color.trim() }))
    .filter((row) => row.name.length > 0)
    .map((row) => ({ id: row.name, name: row.name, color: row.color || undefined }))

const parseMappings = (raw: string): Record<string, string[]> => {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const mappings: Record<string, string[]> = {}
  for (const line of lines) {
    const [parentRaw, childrenRaw = ''] = line.split(':')
    const parent = parentRaw?.trim()
    if (!parent) continue
    const children = childrenRaw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    mappings[parent] = children
  }
  return mappings
}

const stringifyMappings = (mappings: Record<string, string[]>) =>
  Object.entries(mappings)
    .map(([parent, children]) => `${parent}: ${children.join(', ')}`)
    .join('\n')

const parseBatchOptionText = (raw: string): Array<{ name: string; color: string }> =>
  raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [nameRaw, colorRaw = ''] = line.split(/[，,]/)
      return {
        name: (nameRaw ?? '').trim(),
        color: (colorRaw ?? '').trim(),
      }
    })
    .filter((item) => item.name.length > 0)

const toBatchOptionText = (rows: Array<{ name: string; color: string }>) =>
  rows
    .map((row) => (row.color.trim() ? `${row.name},${row.color}` : row.name))
    .join('\n')

const toComparableComponentConfig = (config?: {
  componentType?: FieldComponentType
  options?: FieldOption[]
  cascader?: { parentFieldId: string; mappings: Record<string, string[]> }
}) => {
  if (!config || config.componentType === 'default') {
    return {
      componentType: 'default' as const,
      options: [] as Array<{ name: string; color: string }>,
      cascader: { parentFieldId: '', mappings: [] as Array<{ parent: string; children: string[] }> },
    }
  }
  const normalizedMappings = Object.entries(config.cascader?.mappings ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([parent, children]) => ({ parent, children: [...children] }))
  return {
    componentType: config.componentType,
    options: (config.options ?? []).map((item) => ({ name: item.name, color: item.color ?? '' })),
    cascader: {
      parentFieldId: config.cascader?.parentFieldId ?? '',
      mappings: normalizedMappings,
    },
  }
}

const toOrderedFields = (fields: Field[], fieldOrderIds?: string[]): Field[] => {
  const allIds = fields.map((field) => field.id)
  const configured = (fieldOrderIds ?? []).filter((id) => allIds.includes(id))
  const mergedIds = [...configured, ...allIds.filter((id) => !configured.includes(id))]
  const fieldMap = new Map(fields.map((field) => [field.id, field]))
  return mergedIds.map((id) => fieldMap.get(id)).filter((field): field is Field => !!field)
}

type FieldListFilter = 'all' | 'configured' | 'removed' | 'visible'

export function TableComponents() {
  const { tableId = 'tbl_1', viewId = 'viw_1' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const storeFields = useGridStore((state) => state.fields)
  const storeViews = useGridStore((state) => state.views)
  const viewConfig = useGridStore((state) => state.viewConfig)
  const updateViewConfig = useGridStore((state) => state.updateViewConfig)
  const activeViewId = useGridStore((state) => state.activeViewId)
  const createFieldForView = useGridStore((state) => state.createFieldForView)
  const addFieldToView = useGridStore((state) => state.addFieldToView)
  const removeFieldFromView = useGridStore((state) => state.removeFieldFromView)
  const tableReferenceMembers = useGridStore((state) => state.tableReferenceMembers)
  const setToast = useGridStore((state) => state.setToast)
  const currentViewId = activeViewId ?? viewId
  const hasSetupWizardQuery = searchParams.get('setup') === '1'
  const {
    fieldsByTableId,
    allFields: multiTableAllFields,
    isLoading: multiTableFieldsLoading,
    refreshFields,
  } = useMultiTableFields({
    tableItems,
  })
  const { viewsByTableId, isLoading: multiTableViewsLoading, refreshViews } = useMultiTableViews({
    tableItems,
    storeViews,
    activeTableId: tableId,
  })
  const [localViewOverrides, setLocalViewOverrides] = useState<Record<string, View>>({})
  const [listFilterByTableId, setListFilterByTableId] = useState<Record<string, FieldListFilter>>({})
  const [searchKeywordByTableId, setSearchKeywordByTableId] = useState<Record<string, string>>({})
  const [selectedTargetViewIdByTableId, setSelectedTargetViewIdByTableId] = useState<Record<string, string>>({})
  const [editingTableId, setEditingTableId] = useState(tableId)
  const [referenceMembersByTableId, setReferenceMembersByTableId] = useState<Record<string, ReferenceMember[]>>({})

  const defaultViewConfig = useMemo<ViewConfig>(
    () => ({
      hiddenFieldIds: [],
      columnWidths: {},
      sorts: [],
      filters: [],
    }),
    [],
  )

  const effectiveViewsByTableId = useMemo(
    () =>
      Object.fromEntries(
        tableItems.map((item) => [
          item.id,
          (viewsByTableId[item.id] ?? []).map((view) => {
            if (item.id === tableId && view.id === currentViewId) {
              return { ...view, config: viewConfig }
            }
            return localViewOverrides[view.id] ?? view
          }),
        ]),
      ) as Record<string, View[]>,
    [currentViewId, localViewOverrides, tableId, viewConfig, viewsByTableId],
  )

  useEffect(() => {
    setSelectedTargetViewIdByTableId((prev) => {
      let changed = false
      const next = { ...prev }
      for (const item of tableItems) {
        const tableViews = effectiveViewsByTableId[item.id] ?? []
        const currentSelected = prev[item.id]
        const isValid = !!currentSelected && tableViews.some((view) => view.id === currentSelected)
        if (isValid) continue
        const preferred =
          tableViews.find((view) => item.id === tableId && view.id === currentViewId) ??
          tableViews.find((view) => view.config.isEnabled !== false) ??
          tableViews[0]
        next[item.id] = preferred?.id ?? ''
        changed = true
      }
      return changed ? next : prev
    })
  }, [currentViewId, effectiveViewsByTableId, tableId])

  const editorTableIdSafe = editingTableId || tableId
  const fields = useMemo(
    () => fieldsByTableId[editorTableIdSafe] ?? (editorTableIdSafe === tableId ? storeFields.filter((field) => field.tableId === tableId) : []),
    [editorTableIdSafe, fieldsByTableId, storeFields, tableId],
  )
  const editorTargetView = useMemo(
    () =>
      (effectiveViewsByTableId[editorTableIdSafe] ?? []).find(
        (view) => view.id === selectedTargetViewIdByTableId[editorTableIdSafe],
      ) ?? null,
    [editorTableIdSafe, effectiveViewsByTableId, selectedTargetViewIdByTableId],
  )
  const editorViewConfig = editorTargetView?.config ?? defaultViewConfig
  const bindings = useMemo(() => editorViewConfig.components ?? {}, [editorViewConfig.components])
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editorTab, setEditorTab] = useState<'config' | 'preview'>('config')
  const [isSetupWizardOpen, setIsSetupWizardOpen] = useState(false)
  const [componentType, setComponentType] = useState<FieldComponentType>('default')
  const [optionRows, setOptionRows] = useState<Array<{ name: string; color: string }>>([])
  const [parentFieldId, setParentFieldId] = useState('')
  const [mappingsText, setMappingsText] = useState('')
  const [previewValue, setPreviewValue] = useState('')
  const [previewParentValue, setPreviewParentValue] = useState('')
  const [previewChecked, setPreviewChecked] = useState(false)
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false)
  const [batchEditText, setBatchEditText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  const [isCreateFieldOpen, setIsCreateFieldOpen] = useState(false)
  const [isCreatingField, setIsCreatingField] = useState(false)
  const [newFieldName, setNewFieldName] = useState('')
  const [newFieldType, setNewFieldType] = useState<FieldType>('text')
  const [newFieldOptions, setNewFieldOptions] = useState('')
  const [newFieldTargetTableId, setNewFieldTargetTableId] = useState(tableId)
  const [newFieldTargetViewId, setNewFieldTargetViewId] = useState(currentViewId)

  const selectedField = useMemo(
    () => fields.find((field) => field.id === editingFieldId) ?? null,
    [editingFieldId, fields],
  )
  const routeTableFields = useMemo(
    () => fieldsByTableId[tableId] ?? storeFields.filter((field) => field.tableId === tableId),
    [fieldsByTableId, storeFields, tableId],
  )
  const selectedConfig = editingFieldId ? bindings[editingFieldId] : undefined
  const baselineComponentSignature = useMemo(
    () => JSON.stringify(toComparableComponentConfig(selectedConfig)),
    [selectedConfig],
  )
  const draftComponentSignature = useMemo(
    () =>
      JSON.stringify(
        toComparableComponentConfig(
          componentType === 'default'
            ? undefined
            : {
              componentType,
              options: componentType === 'select' ? toFieldOptions(optionRows) : undefined,
              cascader:
                componentType === 'cascader' && parentFieldId
                  ? {
                    parentFieldId,
                    mappings: parseMappings(mappingsText),
                  }
                  : undefined,
            },
        ),
      ),
    [componentType, mappingsText, optionRows, parentFieldId],
  )
  const hasEditorChanges = useMemo(
    () => !!editingFieldId && baselineComponentSignature !== draftComponentSignature,
    [baselineComponentSignature, draftComponentSignature, editingFieldId],
  )
  const initialBatchEditText = useMemo(() => toBatchOptionText(optionRows), [optionRows])
  const hasBatchEditChanges = useMemo(
    () => batchEditText !== initialBatchEditText,
    [batchEditText, initialBatchEditText],
  )
  const tableNameById = useMemo(
    () => Object.fromEntries(tableItems.map((item) => [item.id, item.name])) as Record<string, string>,
    [],
  )
  const groupModels = useMemo(
    () =>
      tableItems.map((item) => {
        const tableViews = [...(effectiveViewsByTableId[item.id] ?? [])].sort(
          (a, b) => (a.config.order ?? 0) - (b.config.order ?? 0),
        )
        const tableFields = fieldsByTableId[item.id] ?? []
        const targetViewId = selectedTargetViewIdByTableId[item.id] ?? ''
        const targetView = tableViews.find((view) => view.id === targetViewId) ?? null
        const targetViewConfig = targetView?.config ?? defaultViewConfig
        const tableBindings = targetViewConfig.components ?? {}
        const tableHiddenFieldSet = new Set(targetViewConfig.hiddenFieldIds ?? [])
        const tableOrderedFields = toOrderedFields(tableFields, targetViewConfig.fieldOrderIds)
        const currentListFilter = listFilterByTableId[item.id] ?? 'all'
        const currentSearchKeyword = searchKeywordByTableId[item.id] ?? ''
        const normalizedKeyword = currentSearchKeyword.trim().toLowerCase()
        const configuredCount = tableOrderedFields.filter((field) => !!tableBindings[field.id]).length
        const removedCount = tableOrderedFields.filter((field) => tableHiddenFieldSet.has(field.id)).length
        const visibleCount = tableOrderedFields.filter((field) => !tableHiddenFieldSet.has(field.id)).length
        const filteredFields = tableOrderedFields.filter((field) => {
          if (currentListFilter === 'configured' && !tableBindings[field.id]) return false
          if (currentListFilter === 'removed' && !tableHiddenFieldSet.has(field.id)) return false
          if (currentListFilter === 'visible' && tableHiddenFieldSet.has(field.id)) return false
          if (!normalizedKeyword) return true
          const binding = tableBindings[field.id]
          return (
            field.name.toLowerCase().includes(normalizedKeyword) ||
            field.id.toLowerCase().includes(normalizedKeyword) ||
            field.type.toLowerCase().includes(normalizedKeyword) ||
            (binding?.componentType ?? 'default').toLowerCase().includes(normalizedKeyword)
          )
        })
        return {
          tableId: item.id,
          tableName: item.name,
          tableViews,
          targetViewId,
          targetView,
          targetViewConfig,
          tableFields,
          bindings: tableBindings,
          hiddenFieldSet: tableHiddenFieldSet,
          orderedFields: tableOrderedFields,
          filteredFields,
          configuredCount,
          removedCount,
          visibleCount,
          listFilter: currentListFilter,
          searchKeyword: currentSearchKeyword,
          canDragSort: currentListFilter === 'all' && normalizedKeyword.length === 0,
          filterItems: [
            { key: 'all' as const, label: '全部', count: tableOrderedFields.length },
            { key: 'configured' as const, label: '已配置', count: configuredCount },
            { key: 'visible' as const, label: '可见字段', count: visibleCount },
            { key: 'removed' as const, label: '已移除', count: removedCount },
          ],
        }
      }),
    [
      defaultViewConfig,
      effectiveViewsByTableId,
      fieldsByTableId,
      listFilterByTableId,
      searchKeywordByTableId,
      selectedTargetViewIdByTableId,
    ],
  )
  const createFieldTargetViews = useMemo(
    () =>
      [...(effectiveViewsByTableId[newFieldTargetTableId] ?? [])].sort(
        (a, b) => (a.config.order ?? 0) - (b.config.order ?? 0),
      ),
    [effectiveViewsByTableId, newFieldTargetTableId],
  )
  useEffect(() => {
    if (!isCreateFieldOpen) return
    const isValid = !!newFieldTargetViewId && createFieldTargetViews.some((view) => view.id === newFieldTargetViewId)
    if (isValid) return
    const preferred =
      createFieldTargetViews.find((view) => view.id === selectedTargetViewIdByTableId[newFieldTargetTableId]) ??
      createFieldTargetViews.find((view) => view.config.isEnabled !== false) ??
      createFieldTargetViews[0]
    setNewFieldTargetViewId(preferred?.id ?? '')
  }, [
    createFieldTargetViews,
    isCreateFieldOpen,
    newFieldTargetTableId,
    newFieldTargetViewId,
    selectedTargetViewIdByTableId,
  ])
  const hasCreateFieldDraft =
    newFieldName.trim().length > 0 ||
    newFieldType !== 'text' ||
    newFieldOptions.trim().length > 0

  const parentCandidates = useMemo(
    () => fields.filter((field) => field.id !== editingFieldId && field.type === 'singleSelect'),
    [editingFieldId, fields],
  )
  const parsedMappings = useMemo(() => parseMappings(mappingsText), [mappingsText])
  const previewParentField = useMemo(
    () => fields.find((field) => field.id === parentFieldId),
    [fields, parentFieldId],
  )

  const componentTypeChoices = useMemo(() => {
    const allowed = componentOptionsByFieldType[selectedField?.type ?? ''] ?? ['default', 'input']
    return componentTypeOptions.filter((item) => allowed.includes(item.value))
  }, [selectedField?.type])
  const previewShowcaseModels = useMemo(
    () => (selectedField ? buildShowcaseModels(selectedField.type) : []),
    [selectedField],
  )

  const previewMode = useMemo(() => {
    if (componentType !== 'default') {
      return componentType
    }
    if (selectedField?.type === 'member') return 'select'
    if (selectedField?.type === 'singleSelect') return 'select'
    if (selectedField?.type === 'date') return 'date'
    if (selectedField?.type === 'checkbox') return 'checkbox'
    if (selectedField?.type === 'attachment') return 'upload'
    if (selectedField?.type === 'image') return 'image'
    if (selectedField?.type === 'multiSelect') return 'textarea'
    return 'input'
  }, [componentType, selectedField?.type])

  const previewParentOptions: FieldOption[] = useMemo(() => {
    if (previewParentField?.options && previewParentField.options.length > 0) {
      return previewParentField.options
    }
    return Object.keys(parsedMappings).map((item) => ({ id: item, name: item }))
  }, [parsedMappings, previewParentField?.options])

  const activeReferenceMembers = useMemo(
    () => (editorTableIdSafe === tableId ? tableReferenceMembers : referenceMembersByTableId[editorTableIdSafe] ?? []),
    [editorTableIdSafe, referenceMembersByTableId, tableId, tableReferenceMembers],
  )

  const previewSelectOptions: FieldOption[] = useMemo(() => {
    if (previewMode === 'member') {
      return activeReferenceMembers.map((item) => ({ id: item.userId, name: item.username }))
    }
    if (previewMode === 'select') {
      if (selectedField?.type === 'member') {
        return activeReferenceMembers.map((item) => ({ id: item.userId, name: item.username }))
      }
      if (componentType === 'select') {
        return toFieldOptions(optionRows)
      }
      if (selectedField?.type === 'singleSelect') {
        return selectedField.options ?? []
      }
      return []
    }
    if (previewMode === 'cascader') {
      const children = parsedMappings[previewParentValue] ?? []
      return children.map((name) => ({ id: name, name, parentId: previewParentValue }))
    }
    return []
  }, [
    componentType,
    optionRows,
    parsedMappings,
    previewMode,
    previewParentValue,
    selectedField?.options,
    selectedField?.type,
    activeReferenceMembers,
  ])

  const previewSelectedOption = useMemo(
    () => previewSelectOptions.find((item) => item.id === previewValue),
    [previewSelectOptions, previewValue],
  )

  useEffect(() => {
    if (!editingFieldId) {
      return
    }
    setEditorTab('config')
    setComponentType(selectedConfig?.componentType ?? 'default')
    setOptionRows(toOptionRows(selectedConfig?.options))
    setParentFieldId(selectedConfig?.cascader?.parentFieldId ?? '')
    setMappingsText(selectedConfig?.cascader ? stringifyMappings(selectedConfig.cascader.mappings) : '')
    setPreviewValue('')
    setPreviewParentValue('')
    setPreviewChecked(false)
  }, [editingFieldId, selectedConfig?.cascader, selectedConfig?.componentType, selectedConfig?.options])

  useEffect(() => {
    if (!hasSetupWizardQuery) return
    setIsSetupWizardOpen(true)
  }, [hasSetupWizardQuery])

  useEffect(() => {
    const allowed = componentOptionsByFieldType[selectedField?.type ?? ''] ?? ['default', 'input']
    if (!allowed.includes(componentType)) {
      setComponentType('default')
    }
  }, [componentType, selectedField?.type])

  useEffect(() => {
    if (previewMode !== 'cascader') return
    const firstParent = previewParentOptions[0]?.id ?? ''
    if (!previewParentValue || !previewParentOptions.some((item) => item.id === previewParentValue)) {
      setPreviewParentValue(firstParent)
    }
  }, [previewMode, previewParentOptions, previewParentValue])

  useEffect(() => {
    if (previewMode !== 'select' && previewMode !== 'cascader') return
    if (previewValue && !previewSelectOptions.some((item) => item.id === previewValue)) {
      setPreviewValue('')
    }
  }, [previewMode, previewSelectOptions, previewValue])

  useEffect(() => {
    if (!editingFieldId) return
    if (editorTableIdSafe === tableId) return
    if (referenceMembersByTableId[editorTableIdSafe]) return

    let active = true
    void (async () => {
      try {
        const members = await gridApiClient.getTableReferenceMembers(editorTableIdSafe)
        if (!active) return
        setReferenceMembersByTableId((prev) => ({ ...prev, [editorTableIdSafe]: members }))
      } catch {
        if (!active) return
        setReferenceMembersByTableId((prev) => ({ ...prev, [editorTableIdSafe]: [] }))
      }
    })()
    return () => {
      active = false
    }
  }, [editingFieldId, editorTableIdSafe, referenceMembersByTableId, tableId])

  const findGroupModel = (targetTableId: string) => groupModels.find((group) => group.tableId === targetTableId) ?? null

  const applyViewOverride = (nextView: View) => {
    setLocalViewOverrides((prev) => ({ ...prev, [nextView.id]: nextView }))
  }

  const patchTargetViewConfig = async (targetTableId: string, targetViewId: string, patch: Partial<ViewConfig>) => {
    const targetView = (effectiveViewsByTableId[targetTableId] ?? []).find((view) => view.id === targetViewId)
    if (!targetView) {
      setToast('目标视图不存在或尚未加载完成。')
      return null
    }
    const nextConfig: ViewConfig = { ...targetView.config, ...patch }

    if (targetTableId === tableId && targetViewId === currentViewId) {
      updateViewConfig(patch)
      return { ...targetView, config: nextConfig }
    }

    try {
      const updated = await gridApiClient.updateView(targetViewId, { config: nextConfig })
      applyViewOverride(updated)
      if (targetTableId !== tableId) {
        refreshViews()
      }
      return updated
    } catch {
      setToast('更新视图组件配置失败。')
      return null
    }
  }

  const clearSetupQueryParam = () => {
    if (!searchParams.has('setup')) return
    const next = new URLSearchParams(searchParams)
    next.delete('setup')
    setSearchParams(next, { replace: true })
  }

  const handleSetupWizardCancel = () => {
    setIsSetupWizardOpen(false)
    clearSetupQueryParam()
  }

  const handleSetupWizardComplete = async (
    visibleFieldIds: string[],
    components: Record<string, FieldComponentConfig>,
  ) => {
    const visibleFieldSet = new Set(visibleFieldIds)
    const hiddenFieldIds = routeTableFields
      .filter((field) => !visibleFieldSet.has(field.id))
      .map((field) => field.id)
    const updated = await patchTargetViewConfig(tableId, currentViewId, {
      hiddenFieldIds,
      components,
    })
    if (!updated) return
    setIsSetupWizardOpen(false)
    clearSetupQueryParam()
    setToast('视图初始化已完成。')
  }

  const openEditor = (targetTableId: string, fieldId: string) => {
    if (!fieldId) return
    setEditingTableId(targetTableId)
    setEditingFieldId(fieldId)
  }

  const closeEditor = () => {
    setEditingFieldId(null)
    setEditingTableId(tableId)
  }

  const handleRequestCloseEditor = async () => {
    if (isSaving || isClearing) return
    if (!hasEditorChanges) {
      closeEditor()
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的字段配置更改？',
      content: '关闭后当前字段配置草稿将丢失。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    closeEditor()
  }

  const clearFieldBinding = async (fieldId: string, targetTableId = editorTableIdSafe, targetViewId = editorTargetView?.id ?? '') => {
    if (!targetViewId) return
    const targetView = (effectiveViewsByTableId[targetTableId] ?? []).find((view) => view.id === targetViewId)
    if (!targetView) return
    const next = { ...(targetView.config.components ?? {}) }
    delete next[fieldId]
    await patchTargetViewConfig(targetTableId, targetViewId, { components: next })
  }

  const handleClearFieldBinding = async (field: Field, targetTableId = editorTableIdSafe, targetViewId = editorTargetView?.id ?? '') => {
    const confirmed = await confirmAction({
      title: `确认删除字段「${field.name}」的组件配置？`,
      content: '删除后将恢复为默认组件。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    await clearFieldBinding(field.id, targetTableId, targetViewId)
  }

  const handleSave = async () => {
    if (!editingFieldId || !selectedField) return
    const confirmed = await confirmAction({
      title: `确认保存字段「${selectedField.name}」配置？`,
      okText: '确认保存',
    })
    if (!confirmed) return
    setIsSaving(true)
    const next = { ...bindings }
    if (componentType === 'default') {
      delete next[editingFieldId]
      await patchTargetViewConfig(editorTableIdSafe, editorTargetView?.id ?? '', { components: next })
      window.setTimeout(() => setIsSaving(false), 220)
      return
    }
    next[editingFieldId] = {
      componentType,
      options: componentType === 'select' ? toFieldOptions(optionRows) : undefined,
      cascader:
        componentType === 'cascader' && parentFieldId
          ? {
            parentFieldId,
            mappings: parseMappings(mappingsText),
          }
          : undefined,
    }
    await patchTargetViewConfig(editorTableIdSafe, editorTargetView?.id ?? '', { components: next })
    window.setTimeout(() => setIsSaving(false), 220)
  }

  const handleClearCurrent = async () => {
    if (!editingFieldId) return
    const confirmed = await confirmAction({
      title: '确认清除当前字段配置？',
      content: '清除后将恢复为默认组件。',
      okText: '确认清除',
      danger: true,
    })
    if (!confirmed) return
    setIsClearing(true)
    await clearFieldBinding(editingFieldId)
    window.setTimeout(() => setIsClearing(false), 220)
  }

  const assignColorsForUncoloredOptions = () => {
    const palette = colorPresets.map((item) => item.value)
    if (palette.length === 0) return
    setOptionRows((prev) => {
      const start = Math.floor(Math.random() * palette.length)
      let cursor = 0
      return prev.map((item) => {
        if (item.color.trim() || !item.name.trim()) {
          return item
        }
        const nextColor = palette[(start + cursor) % palette.length]
        cursor += 1
        return { ...item, color: nextColor }
      })
    })
  }

  const openBatchEditor = () => {
    setBatchEditText(toBatchOptionText(optionRows))
    setIsBatchEditOpen(true)
  }

  const applyBatchEditor = () => {
    setOptionRows(parseBatchOptionText(batchEditText))
    setIsBatchEditOpen(false)
  }

  const handleCloseBatchEditor = async () => {
    if (!hasBatchEditChanges) {
      setIsBatchEditOpen(false)
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未应用的批量编辑内容？',
      content: '关闭后本次批量编辑输入不会生效。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    setBatchEditText(initialBatchEditText)
    setIsBatchEditOpen(false)
  }

  const resetCreateFieldDraft = () => {
    setNewFieldName('')
    setNewFieldType('text')
    setNewFieldOptions('')
    setNewFieldTargetTableId(tableId)
    setNewFieldTargetViewId(selectedTargetViewIdByTableId[tableId] ?? currentViewId)
  }

  const openCreateFieldModal = (targetTableId = tableId) => {
    setNewFieldTargetTableId(targetTableId)
    setNewFieldTargetViewId(selectedTargetViewIdByTableId[targetTableId] ?? '')
    setNewFieldName('')
    setNewFieldType('text')
    setNewFieldOptions('')
    setIsCreateFieldOpen(true)
  }

  const closeCreateFieldModal = async () => {
    if (isCreatingField) return
    if (!hasCreateFieldDraft) {
      setIsCreateFieldOpen(false)
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的字段信息？',
      content: '关闭后当前字段名称与类型输入将丢失。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    resetCreateFieldDraft()
    setIsCreateFieldOpen(false)
  }

  const handleCreateField = async () => {
    if (isCreatingField) return
    const name = newFieldName.trim()
    if (!name) {
      setToast('请输入字段名称。')
      return
    }
    const targetTableId = newFieldTargetTableId || tableId
    const targetViewId = newFieldTargetViewId || selectedTargetViewIdByTableId[targetTableId]
    if (!targetViewId) {
      setToast('请先为该数据表选择一个目标视图。')
      return
    }
    const options =
      newFieldType === 'singleSelect' || newFieldType === 'multiSelect'
        ? newFieldOptions
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => ({ id: item, name: item }))
        : undefined
    const confirmed = await confirmAction({
      title: `确认新增字段「${name}」并绑定到目标视图？`,
      okText: '确认新增',
    })
    if (!confirmed) return
    setIsCreatingField(true)
    try {
      let created: Field | null = null
      if (targetTableId === tableId) {
        created = await createFieldForView(targetTableId, targetViewId, name, newFieldType, options)
      } else {
        created = await gridApiClient.createField(targetTableId, name, newFieldType, options)
        if (!created) return
        const createdField = created
        const tableViews = effectiveViewsByTableId[targetTableId] ?? []
        const updatedViews = await Promise.all(
          tableViews.map((view) => {
            const hidden = new Set(view.config.hiddenFieldIds ?? [])
            if (view.id === targetViewId) {
              hidden.delete(createdField.id)
            } else {
              hidden.add(createdField.id)
            }
            return gridApiClient.updateView(view.id, {
              config: {
                ...view.config,
                fieldOrderIds: (view.config.fieldOrderIds ?? []).includes(createdField.id)
                  ? view.config.fieldOrderIds
                  : [...(view.config.fieldOrderIds ?? []), createdField.id],
                hiddenFieldIds: [...hidden],
                columnWidths: {
                  ...view.config.columnWidths,
                  [createdField.id]: createdField.width ?? 180,
                },
              },
            })
          }),
        )
        setLocalViewOverrides((prev) => ({
          ...prev,
          ...Object.fromEntries(updatedViews.map((view) => [view.id, view])),
        }))
        refreshViews()
        refreshFields()
        setToast('已新增字段，并绑定到目标视图。')
      }
      if (!created) return
      resetCreateFieldDraft()
      setIsCreateFieldOpen(false)
      openEditor(targetTableId, created.id)
    } finally {
      setIsCreatingField(false)
    }
  }

  const toggleFieldVisibilityInTargetView = async (targetTableId: string, targetViewId: string, field: Field) => {
    const group = findGroupModel(targetTableId)
    if (!group) return
    if (!targetViewId) {
      setToast('请先选择目标视图。')
      return
    }
    const targetView = group.targetView?.id === targetViewId
      ? group.targetView
      : group.tableViews.find((view) => view.id === targetViewId) ?? null
    if (!targetView) {
      setToast('目标视图不存在。')
      return
    }
    const isRemoved = (targetView.config.hiddenFieldIds ?? []).includes(field.id)
    const confirmed = await confirmAction({
      title: isRemoved ? `确认将字段「${field.name}」加入当前视图？` : `确认从当前视图移除字段「${field.name}」？`,
      content: isRemoved ? '字段将恢复显示。' : '仅影响当前视图展示，不会删除字段本身。',
      okText: isRemoved ? '确认加入' : '确认移除',
      danger: !isRemoved,
    })
    if (!confirmed) return
    if (targetTableId === tableId) {
      if (isRemoved) {
        await addFieldToView(targetViewId, field.id)
        return
      }
      await removeFieldFromView(targetViewId, field.id)
      return
    }
    const hiddenSet = new Set(targetView.config.hiddenFieldIds ?? [])
    if (isRemoved) {
      hiddenSet.delete(field.id)
    } else {
      hiddenSet.add(field.id)
    }
    const updated = await patchTargetViewConfig(targetTableId, targetViewId, {
      hiddenFieldIds: [...hiddenSet],
      frozenFieldIds: (targetView.config.frozenFieldIds ?? []).filter((id) => id !== field.id),
      fieldOrderIds: (targetView.config.fieldOrderIds ?? []).includes(field.id)
        ? targetView.config.fieldOrderIds
        : [...(targetView.config.fieldOrderIds ?? []), field.id],
    })
    if (updated) {
      setToast(isRemoved ? '字段已加入该视图。' : '字段已从该视图移除。')
    }
  }

  const reorderFieldIds = async (targetTableId: string, targetViewId: string, sourceFieldId: string, targetFieldId: string) => {
    if (sourceFieldId === targetFieldId) {
      return
    }
    const group = findGroupModel(targetTableId)
    if (!group) return
    const ids = group.orderedFields.map((field) => field.id)
    const sourceIndex = ids.indexOf(sourceFieldId)
    const targetIndex = ids.indexOf(targetFieldId)
    if (sourceIndex < 0 || targetIndex < 0) {
      return
    }
    const nextIds = [...ids]
    const [moved] = nextIds.splice(sourceIndex, 1)
    nextIds.splice(targetIndex, 0, moved)
    await patchTargetViewConfig(targetTableId, targetViewId, { fieldOrderIds: nextIds })
  }

  const handleDragEnterField = (targetTableId: string, targetViewId: string, targetFieldId: string) => {
    if (!draggingFieldId || draggingFieldId === targetFieldId) {
      return
    }
    void reorderFieldIds(targetTableId, targetViewId, draggingFieldId, targetFieldId)
    setDraggingFieldId(targetFieldId)
  }

  return (
    <div className="grid-root tc-page">
      <div className="tc-header">
        <h3 className="tc-title">业务配置 / 表格组件</h3>
        <p className="tc-subtitle">
          当前视图: {currentViewId ?? '-'}。已加载 {tableItems.length} 个数据表、{multiTableAllFields.length} 个字段，可按表分组统一配置。
        </p>
      </div>

      <div className="tc-table-sections">
        {groupModels.map((group) => (
          <section key={group.tableId} className="tc-table-section">
            <div className="tc-table-section-header">
              <div className="tc-table-section-title">
                <span className="tc-table-section-icon"><AppstoreOutlined /></span>
                <div className="tc-table-section-texts">
                  <strong>{group.tableName}</strong>
                  <span>
                    {group.tableViews.length} 个视图 · 当前配置视图：
                    {group.targetView ? `${group.targetView.name} (${group.targetView.type === 'form' ? '表单' : '表格'})` : '未选择'}
                  </span>
                </div>
              </div>
              <div className="tc-table-section-actions">
                <div className="tc-table-view-select">
                  <span className="tc-table-view-select-label">目标视图</span>
                  <CustomSelect
                    value={group.targetViewId || undefined}
                    placeholder={multiTableViewsLoading ? '加载视图中...' : '请选择视图'}
                    onChange={(value) =>
                      setSelectedTargetViewIdByTableId((prev) => ({
                        ...prev,
                        [group.tableId]: (value as string) ?? '',
                      }))
                    }
                    options={group.tableViews.map((view) => ({
                      value: view.id,
                      label: `${view.name} · ${view.type === 'form' ? '表单视图' : '表格视图'}`,
                    }))}
                  />
                </div>
                <button
                  className="cm-btn cm-btn--sm cm-btn--primary"
                  onClick={() => openCreateFieldModal(group.tableId)}
                  disabled={!group.targetViewId || isCreatingField}
                >
                  <PlusOutlined /> 新增字段
                </button>
              </div>
            </div>

            <div className="tc-stats-bar tc-stats-bar--group">
              <span className="tc-stat-item">
                <span className="tc-stat-dot tc-stat-dot--total" />
                全部 {group.orderedFields.length}
              </span>
              <span className="tc-stat-item">
                <span className="tc-stat-dot tc-stat-dot--configured" />
                已配置 {group.configuredCount}
              </span>
              <span className="tc-stat-item">
                <span className="tc-stat-dot tc-stat-dot--visible" />
                可见 {group.visibleCount}
              </span>
              <span className="tc-stat-item">
                <span className="tc-stat-dot tc-stat-dot--removed" />
                已移除 {group.removedCount}
              </span>
              <span className="tc-stat-item tc-stat-item--tableid">{group.tableId}</span>
            </div>

            {!group.targetViewId ? (
              <div className="tc-group-empty">
                {multiTableViewsLoading ? '正在加载该表视图...' : '该数据表暂无可用视图，请先在“视图管理”中创建视图。'}
              </div>
            ) : (
              <section className="tc-field-table">
                <div className="tc-toolbar">
                  <div className="tc-toolbar-left">
                    {group.filterItems.map((item) => (
                      <button
                        key={`${group.tableId}_${item.key}`}
                        className={`cm-btn cm-btn--sm${group.listFilter === item.key ? ' cm-btn--primary' : ''}`}
                        onClick={() =>
                          setListFilterByTableId((prev) => ({
                            ...prev,
                            [group.tableId]: item.key,
                          }))
                        }
                      >
                        {item.label} {item.count}
                      </button>
                    ))}
                  </div>
                  <div className="tc-toolbar-right">
                    <input
                      className="cm-input"
                      value={group.searchKeyword}
                      placeholder="搜索字段名 / 类型 / 组件"
                      onChange={(event) =>
                        setSearchKeywordByTableId((prev) => ({
                          ...prev,
                          [group.tableId]: event.target.value,
                        }))
                      }
                      style={{ width: 240, maxWidth: '100%' }}
                    />
                  </div>
                </div>

                {!group.canDragSort ? (
                  <div className="tc-drag-hint">
                    当前为筛选/搜索结果，已禁用拖拽排序。
                  </div>
                ) : null}

                <div className="tc-field-table-head">
                  <span />
                  <span>字段</span>
                  <span>类型 / 组件 / 状态</span>
                  <span style={{ textAlign: 'right' }}>操作</span>
                </div>
                {group.filteredFields.map((field) => {
                  const binding = group.bindings[field.id]
                  const isDragging = draggingFieldId === field.id
                  const isRemoved = group.hiddenFieldSet.has(field.id)
                  return (
                    <div
                      key={`${group.tableId}_${field.id}`}
                      className={`tc-field-row ${isDragging ? 'tc-field-row--dragging' : ''}`}
                      draggable={group.canDragSort}
                      onDoubleClick={() => openEditor(group.tableId, field.id)}
                      onDragStart={() => {
                        if (!group.canDragSort) return
                        setDraggingFieldId(field.id)
                      }}
                      onDragEnter={() => {
                        if (!group.canDragSort || !group.targetViewId) return
                        handleDragEnterField(group.tableId, group.targetViewId, field.id)
                      }}
                      onDragOver={(event) => {
                        if (!group.canDragSort) return
                        event.preventDefault()
                      }}
                      onDrop={() => {
                        if (!group.canDragSort) return
                        setDraggingFieldId(null)
                      }}
                      onDragEnd={() => setDraggingFieldId(null)}
                      style={{ cursor: group.canDragSort ? 'grab' : 'default' }}
                    >
                      <span
                        className={`tc-drag-handle ${!group.canDragSort ? 'tc-drag-handle--disabled' : ''}`}
                        title={group.canDragSort ? '拖拽排序' : '筛选时不可拖拽'}
                      >
                        ⠿
                      </span>
                      <div className="tc-field-info">
                        <div className="tc-field-name">{field.name}</div>
                        <div className="tc-field-id">{field.id}</div>
                      </div>
                      <div className="tc-field-tags">
                        <span className="tc-tag">{field.type}</span>
                        <span className={`tc-tag ${binding ? 'tc-tag--processing' : ''}`}>
                          {binding?.componentType ?? '默认'}
                        </span>
                        {isRemoved ? (
                          <span className="tc-tag tc-tag--gold">已移除</span>
                        ) : (
                          <span className="tc-tag tc-tag--green">可见</span>
                        )}
                      </div>
                      <div className="tc-field-actions">
                        <button
                          className="cm-btn cm-btn--sm"
                          title="编辑组件"
                          onClick={() => openEditor(group.tableId, field.id)}
                        >
                          ✏
                        </button>
                        <DropdownMenu
                          items={[
                            { key: 'toggleVisible', label: isRemoved ? '加入当前视图' : '从当前视图移除' },
                            { key: 'clearConfig', label: '🗑 删除配置', danger: true, disabled: !binding },
                          ]}
                          onClick={({ key }) => {
                            if (!group.targetViewId) return
                            if (key === 'toggleVisible') {
                              void toggleFieldVisibilityInTargetView(group.tableId, group.targetViewId, field)
                              return
                            }
                            if (key === 'clearConfig') {
                              void handleClearFieldBinding(field, group.tableId, group.targetViewId)
                            }
                          }}
                        >
                          <button className="cm-btn cm-btn--sm" title="更多操作">⋮</button>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
                {group.filteredFields.length === 0 ? (
                  <div className="tc-field-empty">
                    {multiTableFieldsLoading ? '正在加载字段...' : '没有匹配的字段，请调整筛选条件或搜索关键词。'}
                  </div>
                ) : null}
              </section>
            )}
          </section>
        ))}
      </div>

      <ViewSetupWizard
        open={isSetupWizardOpen}
        tableId={tableId}
        viewId={currentViewId}
        fields={routeTableFields}
        onComplete={(visibleFieldIds, components) => {
          void handleSetupWizardComplete(visibleFieldIds, components)
        }}
        onCancel={handleSetupWizardCancel}
      />

      <CustomModal
        open={!!editingFieldId}
        onCancel={() => void handleRequestCloseEditor()}
        width={1080}
        confirmLoading={isSaving || isClearing}
        title={`字段配置 · ${selectedField?.name ?? ''}${editingFieldId ? ` · ${tableNameById[editorTableIdSafe] ?? editorTableIdSafe}` : ''}`}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              className="cm-btn cm-btn--danger"
              onClick={handleClearCurrent}
              disabled={!editingFieldId || !bindings[editingFieldId] || isSaving || isClearing}
            >
              {isClearing ? '清除中...' : '清除配置'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="cm-btn" onClick={() => void handleRequestCloseEditor()} disabled={isSaving || isClearing}>关闭</button>
              <button className="cm-btn cm-btn--primary" onClick={handleSave} disabled={!selectedField || isClearing || isSaving}>
                {isSaving ? '保存中...' : '保存配置'}
              </button>
            </div>
          </div>
        }
      >
        {selectedField ? (
          <div className="tc-editor-modal">
            <div className="tc-editor-tabs">
              <button
                type="button"
                className={`tc-editor-tab ${editorTab === 'config' ? 'is-active' : ''}`}
                onClick={() => setEditorTab('config')}
              >
                配置
              </button>
              <button
                type="button"
                className={`tc-editor-tab ${editorTab === 'preview' ? 'is-active' : ''}`}
                onClick={() => setEditorTab('preview')}
              >
                组件预览
              </button>
            </div>

            {editorTab === 'config' ? (
              <div style={{ display: 'grid', gap: 12, paddingBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">组件类型</label>
                  <CustomSelect
                    value={componentType}
                    onChange={(value) => setComponentType((value ?? 'default') as FieldComponentType)}
                    options={componentTypeChoices.map((item) => ({ value: item.value, label: item.label }))}
                  />
                </div>

                {componentType === 'select' ? (
                  <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label className="form-label" style={{ marginBottom: 0 }}>下拉选项</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="cm-btn cm-btn--sm" onClick={openBatchEditor}>
                          批量编辑
                        </button>
                        <button className="cm-btn cm-btn--sm" onClick={() => setOptionRows((prev) => [...prev, { name: '', color: '' }])}>
                          新增选项
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {optionRows.map((row, index) => (
                        <div key={`opt_${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 150px auto', gap: 8, alignItems: 'center' }}>
                          <input
                            className="cm-input"
                            value={row.name}
                            placeholder={`选项 ${index + 1}`}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setOptionRows((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)),
                              )
                            }
                          />
                          <CustomSelect
                            value={row.color || undefined}
                            placeholder="颜色"
                            allowClear
                            onChange={(value) =>
                              setOptionRows((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, color: (value as string) ?? '' } : item)),
                              )
                            }
                            options={colorPresets.map((item) => ({
                              value: item.value,
                              label: item.label,
                            }))}
                          />
                          <button
                            className="cm-btn cm-btn--sm cm-btn--danger"
                            onClick={() => setOptionRows((prev) => prev.filter((_, i) => i !== index))}
                          >
                            删除
                          </button>
                        </div>
                      ))}
                      {optionRows.length > 0 ? (
                        <button className="cm-btn cm-btn--sm" onClick={assignColorsForUncoloredOptions}>
                          随机配色（未设置）
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {componentType === 'cascader' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">父字段（一级）</label>
                      <CustomSelect
                        value={parentFieldId || undefined}
                        placeholder="请选择父字段"
                        onChange={(value) => setParentFieldId((value as string) ?? '')}
                        options={parentCandidates.map((field) => ({ value: field.id, label: field.name }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">映射配置（格式: 父值: 子值1, 子值2）</label>
                      <textarea
                        className="cm-textarea"
                        style={{ minHeight: 120, padding: 8 }}
                        value={mappingsText}
                        onChange={(e) => setMappingsText(e.target.value)}
                        placeholder={'准备阶段: 待开始, 已受理\n实施阶段: 数据对接中'}
                      />
                    </div>
                  </>
                ) : null}

                <div style={{ border: '1px dashed var(--border-color)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>当前字段预览</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                    可在配置区直接预览当前字段效果，确认后再保存。
                  </div>

                  {previewMode === 'cascader' ? (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label">预览父级值</label>
                      <CustomSelect
                        value={previewParentValue || undefined}
                        placeholder="请选择父级值"
                        onChange={(value) => {
                          setPreviewParentValue((value as string) ?? '')
                          setPreviewValue('')
                        }}
                        options={previewParentOptions.map((item) => ({ value: item.id, label: item.name }))}
                      />
                    </div>
                  ) : null}

                  <div
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      background: '#fff',
                      minHeight: 48,
                      display: 'flex',
                      alignItems: 'center',
                      padding: 6,
                    }}
                  >
                    {previewMode === 'checkbox' ? (
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                        <input
                          type="checkbox"
                          checked={previewChecked}
                          onChange={(e) => setPreviewChecked(e.target.checked)}
                        />
                        勾选示例
                      </label>
                    ) : previewMode === 'textarea' ? (
                      <textarea
                        className="cm-textarea"
                        value={previewValue}
                        onChange={(e) => setPreviewValue(e.target.value)}
                        placeholder="请输入"
                        style={{ minHeight: 78 }}
                      />
                    ) : previewMode === 'date' ? (
                      <input
                        className="cell-input"
                        type="datetime-local"
                        value={previewValue}
                        onChange={(e) => setPreviewValue(e.target.value)}
                        placeholder="请选择日期"
                      />
                    ) : previewMode === 'select' || previewMode === 'member' || previewMode === 'cascader' ? (
                      <select
                        className="cell-input cell-input-inline"
                        value={previewValue}
                        onChange={(e) => setPreviewValue(e.target.value)}
                        style={
                          previewSelectedOption?.color
                            ? {
                              background: `${previewSelectedOption.color}1a`,
                              color: previewSelectedOption.color,
                              borderColor: `${previewSelectedOption.color}66`,
                            }
                            : undefined
                        }
                      >
                        <option value="">请选择</option>
                        {previewSelectOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    ) : previewMode === 'upload' || previewMode === 'image' ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <button className="cm-btn cm-btn--sm" disabled>
                          {previewMode === 'image' ? '选择图片' : '选择文件'}
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>上传组件预览</span>
                      </div>
                    ) : (
                      <input
                        className="cell-input"
                        type="text"
                        value={previewValue}
                        onChange={(e) => setPreviewValue(e.target.value)}
                        placeholder="请输入"
                      />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="tc-preview-tab">
                <div className="tc-preview-tab-hint">
                  按当前字段类型展示所有可用组件，当前已选组件会高亮显示。
                </div>
                <div className="tc-preview-grid">
                  {previewShowcaseModels.map((card) => {
                    const isSelected = card.componentType === componentType
                    return (
                      <article
                        key={`${card.fieldType}:${card.componentType}`}
                        className={`fcs-card fcs-card--current tc-preview-card${isSelected ? ' tc-preview-card--selected' : ''}`}
                      >
                        <header className="fcs-card__header">
                          <div className="fcs-card__title-row">
                            <span className="fcs-card__type">{card.componentType}</span>
                            <strong>{card.componentTypeLabel}</strong>
                            {isSelected ? <span className="fcs-card__badge fcs-card__badge--active">当前选择</span> : null}
                          </div>
                          <p className="fcs-card__desc">{card.componentTypeDescription}</p>
                        </header>
                        <div className="fcs-card__section">
                          <div className="fcs-card__section-title">展示态（Display）</div>
                          <DisplayPreview
                            kind={card.renderKind}
                            context="modal"
                            valueMode="filled"
                            disabled={false}
                            error={false}
                          />
                        </div>
                        <div className="fcs-card__section">
                          <div className="fcs-card__section-title">编辑态（Edit）</div>
                          <EditorPreview
                            kind={card.renderKind}
                            context="modal"
                            variant="current"
                            valueMode="filled"
                            disabled={false}
                            error={false}
                          />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CustomModal>

      <CustomModal
        open={isCreateFieldOpen}
        title="新增字段"
        onCancel={() => void closeCreateFieldModal()}
        onOk={() => void handleCreateField()}
        confirmLoading={isCreatingField}
        cancelDisabled={isCreatingField}
        okText="保存并绑定"
        cancelText="取消"
      >
        <div className="form-group">
          <label className="form-label">目标数据表</label>
          <CustomSelect
            value={newFieldTargetTableId}
            onChange={(value) => setNewFieldTargetTableId((value as string) ?? tableId)}
            options={tableItems.map((item) => ({ value: item.id, label: item.name }))}
          />
        </div>

        <div className="form-group">
          <label className="form-label">绑定到视图</label>
          <CustomSelect
            value={newFieldTargetViewId || undefined}
            placeholder={multiTableViewsLoading ? '加载视图中...' : '请选择视图'}
            onChange={(value) => setNewFieldTargetViewId((value as string) ?? '')}
            options={createFieldTargetViews.map((view) => ({
              value: view.id,
              label: `${view.name} · ${view.type === 'form' ? '表单视图' : '表格视图'}`,
            }))}
          />
          {!newFieldTargetViewId ? (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              请先为目标数据表创建视图后再新增字段绑定。
            </div>
          ) : null}
        </div>

        <div className="form-group">
          <label className="form-label">字段名称</label>
          <input
            className="cm-input"
            value={newFieldName}
            placeholder="例如：负责人"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewFieldName(event.target.value)}
            onKeyDown={(event: React.KeyboardEvent) => event.key === 'Enter' && void handleCreateField()}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">字段类型</label>
          <CustomSelect
            value={newFieldType}
            onChange={(value) => setNewFieldType((value ?? 'text') as FieldType)}
            options={fieldTypeOptions.map((item) => ({ value: item.value, label: item.label }))}
          />
        </div>

        {newFieldType === 'singleSelect' || newFieldType === 'multiSelect' ? (
          <div className="form-group">
            <label className="form-label">预设选项（逗号或换行分隔）</label>
            <textarea
              className="cm-textarea"
              style={{ minHeight: 96, padding: 8 }}
              value={newFieldOptions}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setNewFieldOptions(event.target.value)}
              placeholder={'例如：\n待处理\n进行中\n已完成'}
            />
          </div>
        ) : null}
      </CustomModal>

      <CustomModal
        open={isBatchEditOpen}
        title="批量编辑选项"
        onCancel={() => void handleCloseBatchEditor()}
        onOk={applyBatchEditor}
        okText="应用"
        cancelText="取消"
      >
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8 }}>
          每行一个选项，格式：`名称` 或 `名称,#颜色值`
        </span>
        <textarea
          className="cm-textarea"
          value={batchEditText}
          onChange={(e) => setBatchEditText(e.target.value)}
          placeholder={'待处理,#9ca3af\n进行中,#3b82f6\n已完成,#10b981'}
          style={{ minHeight: 180 }}
        />
      </CustomModal>
    </div>
  )
}
