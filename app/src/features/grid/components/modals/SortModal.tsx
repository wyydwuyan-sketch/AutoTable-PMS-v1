import { useCallback, useMemo, useState } from 'react'
import { App as AntdApp, Button, Card, Modal, Select, Space, Typography } from 'antd'
import type { Field, ViewConfig, SortCondition, SortDraft } from '../../types/grid'
import { newRuleId } from '../../utils/filterUtils'
import { confirmAction } from '../../../../utils/confirmAction'

interface SortModalProps {
  open: boolean
  onCancel: () => void
  fields: Field[]
  viewConfig: ViewConfig
  onUpdateViewConfig: (config: Partial<ViewConfig>) => void
}

type SortRuleDraftTuple = Pick<SortDraft, 'fieldId' | 'direction'>

export function SortModal({ open, onCancel, fields, viewConfig, onUpdateViewConfig }: SortModalProps) {
  const { message } = AntdApp.useApp()
  const [sortRules, setSortRules] = useState<SortDraft[]>([])

  const baselineRules = useMemo<SortRuleDraftTuple[]>(() => {
    if (viewConfig.sorts.length > 0) {
      return viewConfig.sorts.map((item) => ({
        fieldId: item.fieldId,
        direction: item.direction,
      }))
    }
    return []
  }, [viewConfig.sorts])

  const resetDrafts = useCallback(() => {
    setSortRules(baselineRules.map((item) => ({ ...item, id: newRuleId() })))
  }, [baselineRules])

  const currentRules = useMemo(
    () => sortRules.map((item) => ({ fieldId: item.fieldId, direction: item.direction })),
    [sortRules],
  )

  const hasDraftChanges = useMemo(
    () => JSON.stringify(currentRules) !== JSON.stringify(baselineRules),
    [baselineRules, currentRules],
  )

  const duplicateSortFieldNames = useMemo(() => {
    const counts = new Map<string, number>()
    for (const rule of sortRules) {
      if (!rule.fieldId) continue
      counts.set(rule.fieldId, (counts.get(rule.fieldId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([fieldId]) => fields.find((field) => field.id === fieldId)?.name ?? fieldId)
  }, [fields, sortRules])

  const handleApplySort = async () => {
    if (duplicateSortFieldNames.length > 0) {
      message.warning(`排序规则存在重复字段：${duplicateSortFieldNames.join('、')}，请删除重复规则。`)
      return
    }
    const confirmed = await confirmAction({
      title: sortRules.length === 0 ? '确认清空排序规则？' : '确认应用当前排序规则？',
      okText: '确认应用',
    })
    if (!confirmed) return
    const nextSorts = sortRules
      .filter((rule) => rule.fieldId)
      .map((rule) => ({ fieldId: rule.fieldId, direction: rule.direction })) satisfies SortCondition[]
    onUpdateViewConfig({ sorts: nextSorts })
    onCancel()
  }

  const handleRequestClose = async () => {
    if (!hasDraftChanges) {
      onCancel()
      return
    }
    const confirmed = await confirmAction({
      title: '放弃未保存的排序编辑？',
      content: '关闭后当前排序草稿不会生效。',
      okText: '放弃并关闭',
      danger: true,
    })
    if (!confirmed) return
    onCancel()
  }

  return (
    <Modal
      open={open}
      title="排序记录"
      onCancel={() => void handleRequestClose()}
      onOk={() => void handleApplySort()}
      okText="应用排序"
      cancelText="取消"
      width={760}
      centered
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingTop: 10 } }}
      afterOpenChange={(nextOpen) => {
        if (nextOpen) {
          resetDrafts()
        }
      }}
      destroyOnHidden={false}
    >
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Card size="small" styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <Space size={6} wrap>
              <Typography.Text strong>排序草稿</Typography.Text>
              <Typography.Text type="secondary">共 {sortRules.length} 条规则</Typography.Text>
            </Space>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => setSortRules([])}
                disabled={sortRules.length === 0}
              >
                清空排序
              </Button>
              <Typography.Text type={hasDraftChanges ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
                {hasDraftChanges ? '存在未应用更改' : '草稿与当前排序一致'}
              </Typography.Text>
            </Space>
          </div>
        </Card>
        {sortRules.length === 0 ? (
          <Card size="small" styles={{ body: { padding: 12 } }}>
            <Typography.Text type="secondary">当前未设置排序规则。你可以点击下方“+ 添加规则”。</Typography.Text>
          </Card>
        ) : null}
        {sortRules.map((rule, index) => (
          <Card
            key={rule.id}
            size="small"
            title={`规则 ${index + 1}`}
            styles={{ body: { paddingTop: 12 } }}
            extra={
              <Button
                size="small"
                danger
                onClick={() => setSortRules((prev) => prev.filter((item) => item.id !== rule.id))}
              >
                删除
              </Button>
            }
          >
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 160px' }}>
              <Select
                value={rule.fieldId || undefined}
                placeholder="选择字段"
                options={fields.map((field) => ({ label: field.name, value: field.id }))}
                onChange={(value) =>
                  setSortRules((prev) =>
                    prev.map((item) =>
                      item.id === rule.id ? { ...item, fieldId: String(value ?? '') } : item,
                    ),
                  )
                }
                showSearch
                optionFilterProp="label"
              />
              <Select
                value={rule.direction}
                options={[
                  { label: '升序 (Asc)', value: 'asc' },
                  { label: '降序 (Desc)', value: 'desc' },
                ]}
                onChange={(value) =>
                  setSortRules((prev) =>
                    prev.map((item) =>
                      item.id === rule.id
                        ? { ...item, direction: value as SortDraft['direction'] }
                        : item,
                    ),
                  )
                }
              />
            </div>
          </Card>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Typography.Text type="secondary">
            从上到下按优先级依次应用排序规则
          </Typography.Text>
          <Button
            type="dashed"
            onClick={() =>
              setSortRules((prev) => [
                ...prev,
                { id: newRuleId(), fieldId: fields[0]?.id ?? '', direction: 'asc' },
              ])
            }
          >
            + 添加规则
          </Button>
        </div>
      </Space>
    </Modal>
  )
}
