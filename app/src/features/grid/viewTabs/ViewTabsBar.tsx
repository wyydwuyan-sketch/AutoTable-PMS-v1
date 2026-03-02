import { useEffect, useMemo, useState } from 'react'
import { gridApiClient } from '../api'
import type { FilterCondition, FilterLogic, SortCondition, ViewTab } from '../types/grid'
import { confirmAction } from '../../../utils/confirmAction'
import { promptForText } from '../../../utils/promptForText'
import { getApiErrorMessage } from '../../../utils/apiError'

type CurrentPayload = {
  filterLogic: FilterLogic
  filters: FilterCondition[]
  sorts: SortCondition[]
}

interface ViewTabsBarProps {
  viewId: string
  tableId: string
  current: CurrentPayload
  onApply: (payload: CurrentPayload) => void
  onToast?: (message: string, level?: 'success' | 'info' | 'warning' | 'error') => void
}

const normalizePayload = (payload: CurrentPayload) => ({
  filterLogic: payload.filterLogic ?? 'and',
  filters: payload.filters ?? [],
  sorts: payload.sorts ?? [],
})

const payloadKey = (payload: CurrentPayload) => JSON.stringify(normalizePayload(payload))

export function ViewTabsBar({
  viewId,
  tableId,
  current,
  onApply,
  onToast,
}: ViewTabsBarProps) {
  const [tabs, setTabs] = useState<ViewTab[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTabId, setActiveTabId] = useState<string>('sys_all')

  const reloadTabs = async () => {
    setLoading(true)
    try {
      const list = await gridApiClient.getViewTabs(viewId)
      setTabs(list)
    } catch (error) {
      onToast?.(getApiErrorMessage(error, '加载标签失败。'), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reloadTabs()
  }, [viewId])

  const currentKey = useMemo(() => payloadKey(current), [current])
  useEffect(() => {
    const matched = tabs.find((item) => payloadKey(item.payload) === currentKey)
    if (matched) {
      setActiveTabId(matched.id)
      return
    }
    setActiveTabId('')
  }, [currentKey, tabs])

  const saveCurrentAsTab = async () => {
    const name = await promptForText('保存当前筛选为标签', '', '例如：本周重点')
    if (!name) return
    try {
      await gridApiClient.createViewTab(viewId, {
        name,
        visibility: 'personal',
        payload: {
          filterLogic: current.filterLogic,
          filters: current.filters,
          sorts: current.sorts,
        },
      })
      await reloadTabs()
      onToast?.('标签已保存。', 'success')
    } catch (error) {
      onToast?.(getApiErrorMessage(error, '保存标签失败。'), 'error')
    }
  }

  const deleteTab = async (tab: ViewTab) => {
    const confirmed = await confirmAction({
      title: `确认删除标签「${tab.name}」？`,
      content: '删除后不可恢复。',
      okText: '确认删除',
      danger: true,
    })
    if (!confirmed) return
    try {
      await gridApiClient.deleteViewTab(viewId, tab.id)
      await reloadTabs()
      onToast?.('标签已删除。', 'success')
    } catch (error) {
      onToast?.(getApiErrorMessage(error, '删除标签失败。'), 'error')
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      {(loading ? [] : tabs).map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              border: `1px solid ${active ? 'var(--primary)' : 'var(--border-color)'}`,
              borderRadius: 999,
              background: active ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--bg-panel)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              className="cm-btn cm-btn--sm"
              style={{ border: 'none', background: 'transparent' }}
              onClick={() => {
                setActiveTabId(tab.id)
                onApply({
                  filterLogic: tab.payload.filterLogic,
                  filters: tab.payload.filters,
                  sorts: tab.payload.sorts,
                })
              }}
            >
              {tab.name}
            </button>
            {!tab.isSystemPreset ? (
              <button
                type="button"
                className="cm-btn cm-btn--sm"
                style={{ border: 'none', borderLeft: '1px solid var(--border-color)', background: 'transparent' }}
                onClick={() => void deleteTab(tab)}
                title="删除标签"
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
      <button type="button" className="cm-btn cm-btn--sm" onClick={() => void saveCurrentAsTab()}>
        + 保存标签
      </button>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tableId}</span>
    </div>
  )
}
