import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { gridApiClient } from '../api'
import type { FilterCondition, FilterLogic, SortCondition, ViewTab } from '../types/grid'
import { confirmAction } from '../../../utils/confirmAction'
import { getApiErrorMessage } from '../../../utils/apiError'

type CurrentPayload = {
  filterLogic: FilterLogic
  filters: FilterCondition[]
  sorts: SortCondition[]
}

type PayloadLike = Partial<CurrentPayload> | null | undefined
const OPERATION_LOG_EVENT = 'grid_operation_logs_updated'
const ALL_DATA_TAB_ID = '__all_data__'
const ALL_DATA_TAB_NAME = '全部数据'
const COUNT_REFRESH_DEBOUNCE_MS = 320

interface ViewTabsBarProps {
  viewId: string
  tableId: string
  reloadToken?: number
  current: CurrentPayload
  onApply: (payload: CurrentPayload) => void
  onToast?: (message: string, level?: 'success' | 'info' | 'warning' | 'error') => void
  toolbarSlot?: ReactNode
}

const normalizePayload = (payload: PayloadLike) => ({
  filterLogic: payload?.filterLogic ?? 'and',
  filters: Array.isArray(payload?.filters) ? payload.filters : [],
  sorts: Array.isArray(payload?.sorts) ? payload.sorts : [],
})

const payloadKey = (payload: PayloadLike) => JSON.stringify(normalizePayload(payload))
const isAllDataPayload = (payload: PayloadLike) => {
  const normalized = normalizePayload(payload)
  return normalized.filters.length === 0 && normalized.sorts.length === 0
}

export function ViewTabsBar({
  viewId,
  tableId,
  reloadToken = 0,
  current,
  onApply,
  onToast,
  toolbarSlot,
}: ViewTabsBarProps) {
  const [tabs, setTabs] = useState<ViewTab[]>([])
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [activeTabId, setActiveTabId] = useState<string>('')
  const [countRefreshToken, setCountRefreshToken] = useState(0)
  const allDataTab = useMemo<ViewTab>(
    () => ({
      id: ALL_DATA_TAB_ID,
      viewId,
      tableId,
      name: ALL_DATA_TAB_NAME,
      visibility: 'system',
      ownerUserId: null,
      isSystemPreset: true,
      sortOrder: Number.MIN_SAFE_INTEGER,
      payload: {
        filterLogic: 'and',
        filters: [],
        sorts: [],
      },
    }),
    [tableId, viewId],
  )
  const displayTabs = useMemo(() => [allDataTab, ...tabs], [allDataTab, tabs])

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
  }, [reloadToken, viewId])

  const currentKey = useMemo(() => payloadKey(current), [current])
  useEffect(() => {
    if (isAllDataPayload(current)) {
      setActiveTabId(ALL_DATA_TAB_ID)
      return
    }
    const matched = tabs.find((item) => payloadKey(item.payload) === currentKey)
    if (matched) {
      setActiveTabId(matched.id)
      return
    }
    setActiveTabId('')
  }, [current, currentKey, tabs])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }
    let timer: number | null = null
    const handler = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      timer = window.setTimeout(() => {
        setCountRefreshToken((value) => value + 1)
      }, COUNT_REFRESH_DEBOUNCE_MS)
    }
    window.addEventListener(OPERATION_LOG_EVENT, handler)
    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      window.removeEventListener(OPERATION_LOG_EVENT, handler)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (displayTabs.length === 0 || !tableId || !viewId) {
      setTabCounts({})
      return
    }
    void (async () => {
      try {
        const counts = await gridApiClient.batchTabCounts(
          tableId,
          viewId,
          displayTabs.map((tab) => ({
            tabId: tab.id,
            payload: normalizePayload(tab.payload),
          })),
        )
        if (!active) return
        const normalized: Record<string, number> = {}
        for (const tab of displayTabs) {
          normalized[tab.id] = Number.isFinite(counts[tab.id]) ? Number(counts[tab.id]) : 0
        }
        setTabCounts(normalized)
      } catch {
        if (!active) return
        setTabCounts(Object.fromEntries(displayTabs.map((tab) => [tab.id, 0])))
      }
    })()
    return () => {
      active = false
    }
  }, [countRefreshToken, displayTabs, tableId, viewId])

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
    <div className="view-filter-tabs-row">
      {/* Left: tabs */}
      <div className="view-filter-tabs">
        {(loading ? [allDataTab] : displayTabs).map((tab) => {
          const active = tab.id === activeTabId
          const count = tabCounts[tab.id] ?? 0
          return (
            <div key={tab.id} className={`view-filter-tab${active ? ' is-active' : ''}`}>
              <button
                type="button"
                className="view-filter-tab-main"
                onClick={() => {
                  setActiveTabId(tab.id)
                  const payload = normalizePayload(tab.payload)
                  onApply({
                    filterLogic: payload.filterLogic,
                    filters: payload.filters,
                    sorts: payload.sorts,
                  })
                }}
              >
                <span className="view-filter-tab-label">{tab.name}</span>
                <span className="view-filter-tab-count">{count.toLocaleString()}</span>
              </button>
              {!tab.isSystemPreset ? (
                <button
                  type="button"
                  className="view-filter-tab-remove"
                  onClick={() => void deleteTab(tab)}
                  title="删除标签"
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Right: toolbar buttons (injected from parent) */}
      {toolbarSlot ? <div className="view-filter-toolbar-slot">{toolbarSlot}</div> : null}
    </div>
  )
}
