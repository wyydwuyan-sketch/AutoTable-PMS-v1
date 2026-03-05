import { useCallback, useMemo, useState } from 'react'
import { App as AntdApp, Button, Card, Input, Modal, Radio, Space, Tag, Typography, Select } from 'antd'
import type { Field, ViewConfig, FilterCondition, FilterLogic, FilterPreset, FilterDraft } from '../../types/grid'
import { newRuleId, newPresetId, defaultOpByType, getFilterOpsByType, normalizeFilterValue } from '../../utils/filterUtils'
import { confirmAction } from '../../../../utils/confirmAction'
import { gridApiClient } from '../../api'

interface FilterModalProps {
  open: boolean
  onCancel: () => void
  viewId: string
  fields: Field[]
  viewConfig: ViewConfig
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void
  onPresetSavedAsTab?: () => void
}

type FilterRuleDraftTuple = Pick<FilterDraft, 'fieldId' | 'op' | 'value'>

const normalizeFilterOp = (op: FilterCondition['op']): FilterDraft['op'] => {
  if (
    op === 'equals' ||
    op === 'neq' ||
    op === 'gt' ||
    op === 'gte' ||
    op === 'lt' ||
    op === 'lte'
  ) {
    return op
  }
  return 'contains'
}

function FlexFilterSummary({
  ruleCount,
  filterLogicDraft,
  selectedPresetId,
  hasDraftChanges,
}: {
  ruleCount: number
  filterLogicDraft: FilterLogic
  selectedPresetId: string
  hasDraftChanges: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <Space size={6} wrap>
        <Tag color="blue">规则 {ruleCount}</Tag>
        <Tag color={filterLogicDraft === 'and' ? 'geekblue' : 'purple'}>
          {filterLogicDraft === 'and' ? 'AND' : 'OR'}
        </Tag>
        {selectedPresetId ? <Tag color="gold">已选方案</Tag> : null}
        {hasDraftChanges ? <Tag color="orange">草稿未保存</Tag> : <Tag color="green">草稿已同步</Tag>}
      </Space>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        先编辑草稿，再点击右下角“应用筛选”生效
      </Typography.Text>
    </div>
  )
}

export function FilterModal({
  open,
  onCancel,
  viewId,
  fields,
  viewConfig,
  onUpdateViewConfig,
  onPresetSavedAsTab,
}: FilterModalProps) {
  const { message } = AntdApp.useApp()
  const [filterRules, setFilterRules] = useState<FilterDraft[]>([])
  const [filterLogicDraft, setFilterLogicDraft] = useState<FilterLogic>('and')
  const [presetName, setPresetName] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)

  const getField = useCallback(
    (fieldId: string) => fields.find((field) => field.id === fieldId),
    [fields],
  )

  const sortedPresets = useMemo(() => {
    const presets = viewConfig.filterPresets ?? []
    return [...presets].sort((a, b) => {
      const ap = a.pinned ? 1 : 0
      const bp = b.pinned ? 1 : 0
      if (ap !== bp) return bp - ap
      return a.name.localeCompare(b.name, 'zh-Hans-CN')
    })
  }, [viewConfig.filterPresets])

  const baselineRules = useMemo<FilterRuleDraftTuple[]>(() => {
    if (viewConfig.filters.length > 0) {
      return viewConfig.filters.map((item) => ({
        fieldId: item.fieldId,
        op: normalizeFilterOp(item.op),
        value: String(item.value ?? ''),
      }))
    }
    return [
      {
        fieldId: fields[0]?.id ?? '',
        op: defaultOpByType(fields[0]?.type),
        value: '',
      },
    ]
  }, [fields, viewConfig.filters])

  const resetDrafts = useCallback(() => {
    setFilterRules(baselineRules.map((item) => ({ ...item, id: newRuleId() })))
    setFilterLogicDraft(viewConfig.filterLogic ?? 'and')
    setPresetName('')
    setRenameTarget(null)
  }, [baselineRules, viewConfig.filterLogic])

  const currentRules = useMemo(
    () => filterRules.map((item) => ({ fieldId: item.fieldId, op: item.op, value: item.value })),
    [filterRules],
  )

  const hasDraftChanges = useMemo(
    () =>
      JSON.stringify(currentRules) !== JSON.stringify(baselineRules) ||
      filterLogicDraft !== (viewConfig.filterLogic ?? 'and') ||
      presetName.trim().length > 0 ||
      renameTarget !== null,
    [baselineRules, currentRules, filterLogicDraft, presetName, renameTarget, viewConfig.filterLogic],
  )

  const buildAppliedFilters = useCallback(
    () =>
      filterRules
        .filter((rule) => rule.fieldId && rule.value.trim())
        .map((rule) => ({
          fieldId: rule.fieldId,
          op: rule.op,
          value: normalizeFilterValue(fields, rule.fieldId, rule.op, rule.value.trim()),
        })) satisfies FilterCondition[],
    [fields, filterRules],
  )

  const getDuplicateFilterFieldNames = useCallback(() => {
    const counts = new Map<string, number>()
    for (const rule of filterRules) {
      if (!rule.fieldId || !rule.value.trim()) continue
      counts.set(rule.fieldId, (counts.get(rule.fieldId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([fieldId]) => getField(fieldId)?.name ?? fieldId)
  }, [filterRules, getField])

  const validateNoDuplicateFilterFields = useCallback(() => {
    const duplicates = getDuplicateFilterFieldNames()
    if (duplicates.length === 0) {
      return true
    }
    message.warning(`筛选规则存在重复字段：${duplicates.join('、')}，请合并或删除重复规则。`)
    return false
  }, [getDuplicateFilterFieldNames, message])

  const handleApplyFilter = async () => {
    if (!validateNoDuplicateFilterFields()) return
    const confirmed = await confirmAction({
      title: '确认应用当前筛选条件？',
      okText: '确认应用',
    })
    if (!confirmed) return
    onUpdateViewConfig({ filters: buildAppliedFilters(), filterLogic: filterLogicDraft })
    onCancel()
  }

  const savePreset = async () => {
    if (!validateNoDuplicateFilterFields()) return
    const name = presetName.trim()
    if (!name) {
      message.warning('请输入筛选方案名称')
      return
    }
    const confirmed = await confirmAction({
      title: `确认保存筛选方案「${name}」？`,
      okText: '确认保存',
    })
    if (!confirmed) return

    const nextFilters = buildAppliedFilters()
    const nextTabPayload = {
      filterLogic: filterLogicDraft,
      filters: nextFilters,
      sorts: [...viewConfig.sorts],
    }
    const existingByName = (viewConfig.filterPresets ?? []).find((item) => item.name === name)
    const preset: FilterPreset = {
      id: existingByName?.id ?? newPresetId(),
      name,
      pinned: existingByName?.pinned ?? false,
      filters: nextFilters,
      sorts: nextTabPayload.sorts,
      filterLogic: filterLogicDraft,
    }
    const existing = viewConfig.filterPresets ?? []
    const withoutSameName = existing.filter((item) => item.name !== name)
    onUpdateViewConfig({ filterPresets: [...withoutSameName, preset] })
    setPresetName('')

    try {
      if (!viewId) return
      const existingTabs = await gridApiClient.getViewTabs(viewId)
      const matchedTab = existingTabs.find(
        (item) => !item.isSystemPreset && item.name.trim() === name,
      )
      if (matchedTab) {
        await gridApiClient.updateViewTab(viewId, matchedTab.id, {
          name,
          payload: nextTabPayload,
        })
      } else {
        await gridApiClient.createViewTab(viewId, {
          name,
          visibility: 'personal',
          payload: nextTabPayload,
        })
      }
      onPresetSavedAsTab?.()
    } catch {
      message.warning('筛选方案已保存，但同步标签失败。')
    }
  }

  const applyPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    const preset = (viewConfig.filterPresets ?? []).find((item) => item.id === presetId)
    if (!preset) return
    onUpdateViewConfig({
      filters: preset.filters,
      sorts: preset.sorts,
      filterLogic: preset.filterLogic,
    })
  }

  const deletePreset = async (presetId: string) => {
    const target = (viewConfig.filterPresets ?? []).find((item) => item.id === presetId)
    if (!target) return
    const confirmed = await confirmAction({
      title: `确认删除筛选方案「${target.name}」？`,
      content: '删除后不可恢复。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    const next = (viewConfig.filterPresets ?? []).filter((item) => item.id !== presetId)
    onUpdateViewConfig({ filterPresets: next })
    if (selectedPresetId === presetId) {
      setSelectedPresetId('')
    }
    if (renameTarget?.id === presetId) {
      setRenameTarget(null)
    }
  }

  const startRename = (presetId: string) => {
    const current = (viewConfig.filterPresets ?? []).find((item) => item.id === presetId)
    if (!current) return
    setRenameTarget({ id: presetId, name: current.name })
  }

  const commitRename = () => {
    if (!renameTarget) return
    const nextName = renameTarget.name.trim()
    if (!nextName) {
      message.warning('方案名称不能为空')
      return
    }
    const next = (viewConfig.filterPresets ?? []).map((item) =>
      item.id === renameTarget.id ? { ...item, name: nextName } : item,
    )
    onUpdateViewConfig({ filterPresets: next })
    setRenameTarget(null)
  }

  const togglePresetPin = (presetId: string) => {
    const next = (viewConfig.filterPresets ?? []).map((item) =>
      item.id === presetId ? { ...item, pinned: !item.pinned } : item,
    )
    onUpdateViewConfig({ filterPresets: next })
  }

  const handleRequestClose = async () => {
    if (!hasDraftChanges) {
      onCancel()
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的筛选编辑？',
      content: '关闭后当前筛选草稿不会生效。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    onCancel()
  }

  return (
    <Modal
      open={open}
      title="筛选记录"
      onCancel={() => void handleRequestClose()}
      onOk={() => void handleApplyFilter()}
      okText="应用筛选"
      cancelText="取消"
      width={920}
      centered
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto', paddingTop: 10 } }}
      afterOpenChange={(nextOpen) => {
        if (nextOpen) {
          resetDrafts()
        }
      }}
      destroyOnClose={false}
    >
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Card size="small" styles={{ body: { padding: 12 } }}>
          <FlexFilterSummary
            ruleCount={filterRules.length}
            filterLogicDraft={filterLogicDraft}
            selectedPresetId={selectedPresetId}
            hasDraftChanges={hasDraftChanges}
          />
        </Card>
        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            规则关系
          </Typography.Text>
          <Radio.Group
            value={filterLogicDraft}
            onChange={(event) => setFilterLogicDraft(event.target.value as FilterLogic)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: 'AND（全部满足）', value: 'and' },
              { label: 'OR（任一满足）', value: 'or' },
            ]}
          />
        </div>

        {filterRules.map((rule, index) => {
          const field = getField(rule.fieldId)
          const fieldOptions = fields.map((item) => ({ label: item.name, value: item.id }))
          const opOptions = getFilterOpsByType(field?.type).map((op) => ({ label: op.label, value: op.value }))

          return (
            <Card
              key={rule.id}
              size="small"
              title={`规则 ${index + 1}`}
              styles={{ body: { paddingTop: 12 } }}
              extra={
                <Button
                  size="small"
                  danger
                  disabled={filterRules.length <= 1}
                  onClick={() => setFilterRules((prev) => prev.filter((item) => item.id !== rule.id))}
                >
                  删除
                </Button>
              }
            >
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 160px 1fr' }}>
                <Select
                  value={rule.fieldId || undefined}
                  placeholder="选择字段"
                  options={fieldOptions}
                  onChange={(value) =>
                    setFilterRules((prev) =>
                      prev.map((item) => {
                        if (item.id !== rule.id) return item
                        const nextFieldId = String(value ?? '')
                        const nextType = getField(nextFieldId)?.type
                        return { ...item, fieldId: nextFieldId, op: defaultOpByType(nextType), value: '' }
                      }),
                    )
                  }
                  showSearch
                  optionFilterProp="label"
                />
                <Select
                  value={rule.op}
                  options={opOptions}
                  onChange={(value) =>
                    setFilterRules((prev) =>
                      prev.map((item) =>
                        item.id === rule.id ? { ...item, op: value as FilterDraft['op'] } : item,
                      ),
                    )
                  }
                />
                {field?.type === 'singleSelect' ? (
                  <Select
                    value={rule.value || undefined}
                    placeholder="请选择"
                    allowClear
                    options={(field.options ?? []).map((option) => ({
                      label: option.name,
                      value: option.id,
                    }))}
                    onChange={(value) =>
                      setFilterRules((prev) =>
                        prev.map((item) =>
                          item.id === rule.id ? { ...item, value: value == null ? '' : String(value) } : item,
                        ),
                      )
                    }
                  />
                ) : (
                  <Input
                    type={
                      field?.type === 'number'
                        ? 'number'
                        : field?.type === 'date'
                          ? 'date'
                          : 'text'
                    }
                    value={rule.value}
                    placeholder="输入值"
                    onChange={(event) =>
                      setFilterRules((prev) =>
                        prev.map((item) =>
                          item.id === rule.id ? { ...item, value: event.target.value } : item,
                        ),
                      )
                    }
                  />
                )}
              </div>
            </Card>
          )
        })}

        <Button
          type="dashed"
          onClick={() =>
            setFilterRules((prev) => [
              ...prev,
              {
                id: newRuleId(),
                fieldId: fields[0]?.id ?? '',
                op: defaultOpByType(fields[0]?.type),
                value: '',
              },
            ])
          }
        >
          + 添加规则
        </Button>

        <div>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            保存为筛选方案
          </Typography.Text>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              value={presetName}
              placeholder="例如：高优先级待处理"
              onChange={(event) => setPresetName(event.target.value)}
              onPressEnter={() => void savePreset()}
            />
            <Button onClick={() => void savePreset()}>保存方案</Button>
          </Space.Compact>
        </div>

        {sortedPresets.length > 0 ? (
          <div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
              已有方案
            </Typography.Text>
            <Space direction="vertical" size={8} style={{ display: 'flex' }}>
              {sortedPresets.map((preset) => (
                <Card key={preset.id} size="small">
                  {renameTarget?.id === preset.id ? (
                    <Space.Compact style={{ width: '100%' }}>
                      <Input
                        autoFocus
                        value={renameTarget.name}
                        onChange={(event) =>
                          setRenameTarget({ ...renameTarget, name: event.target.value })
                        }
                        onPressEnter={commitRename}
                      />
                      <Button type="primary" onClick={commitRename}>
                        确定
                      </Button>
                      <Button onClick={() => setRenameTarget(null)}>
                        取消
                      </Button>
                    </Space.Compact>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {preset.pinned ? <Tag color="gold">置顶</Tag> : null}
                        {selectedPresetId === preset.id ? <Tag color="blue">当前选中</Tag> : null}
                        <Typography.Text>{preset.name}</Typography.Text>
                      </div>
                      <Space size={6} wrap>
                        <Button size="small" type="primary" ghost onClick={() => applyPreset(preset.id)}>
                          应用
                        </Button>
                        <Button size="small" onClick={() => startRename(preset.id)}>
                          重命名
                        </Button>
                        <Button size="small" onClick={() => togglePresetPin(preset.id)}>
                          {preset.pinned ? '取消置顶' : '置顶'}
                        </Button>
                        <Button size="small" danger onClick={() => void deletePreset(preset.id)}>
                          删除
                        </Button>
                      </Space>
                    </div>
                  )}
                </Card>
              ))}
            </Space>
          </div>
        ) : null}
      </Space>
    </Modal>
  )
}
