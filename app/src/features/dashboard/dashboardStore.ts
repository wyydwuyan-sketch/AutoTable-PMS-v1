import { create } from 'zustand'
import { dashboardApi } from './api'
import type { Dashboard, DashboardWidget, WidgetCreatePayload, WidgetData, WidgetUpdatePayload } from './types'

type LayoutItem = { i: string; x: number; y: number; w: number; h: number }

interface DashboardState {
  dashboard: Dashboard | null
  widgetDataMap: Record<string, WidgetData>
  isLoading: boolean
  error: string | null
  loadDashboard: () => Promise<void>
  fetchWidgetData: (widgetId: string) => Promise<void>
  addWidget: (payload: WidgetCreatePayload) => Promise<void>
  updateWidget: (widgetId: string, patch: WidgetUpdatePayload) => Promise<void>
  deleteWidget: (widgetId: string) => Promise<void>
  updateLayout: (layouts: LayoutItem[]) => void
}

const LAYOUT_SAVE_DEBOUNCE_MS = 1000
const layoutSaveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const shouldRefetchWidgetData = (patch: WidgetUpdatePayload) =>
  patch.tableId !== undefined ||
  patch.fieldIds !== undefined ||
  patch.aggregation !== undefined ||
  patch.groupFieldId !== undefined ||
  patch.config !== undefined

const clearLayoutTimer = (widgetId: string) => {
  const existing = layoutSaveTimers.get(widgetId)
  if (!existing) return
  clearTimeout(existing)
  layoutSaveTimers.delete(widgetId)
}

const upsertWidget = (widgets: DashboardWidget[], nextWidget: DashboardWidget) =>
  widgets.map((item) => (item.id === nextWidget.id ? nextWidget : item))

export const useDashboardStore = create<DashboardState>((set, get) => ({
  dashboard: null,
  widgetDataMap: {},
  isLoading: false,
  error: null,

  loadDashboard: async () => {
    set({ isLoading: true, error: null })
    try {
      const dashboard = await dashboardApi.getCurrent()
      set({ dashboard, isLoading: false })
      await Promise.allSettled(
        dashboard.widgets.map((widget) => get().fetchWidgetData(widget.id)),
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载大屏配置失败。'
      set({ isLoading: false, error: message })
    }
  },

  fetchWidgetData: async (widgetId) => {
    try {
      const data = await dashboardApi.getWidgetData(widgetId)
      set((state) => ({
        widgetDataMap: {
          ...state.widgetDataMap,
          [widgetId]: data,
        },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载组件数据失败。'
      set((state) => ({
        widgetDataMap: {
          ...state.widgetDataMap,
          [widgetId]: {
            type: 'metric',
            data: null,
            error: message,
          },
        },
      }))
    }
  },

  addWidget: async (payload) => {
    const created = await dashboardApi.createWidget(payload)
    set((state) => ({
      dashboard: state.dashboard
        ? {
            ...state.dashboard,
            widgets: [...state.dashboard.widgets, created],
          }
        : state.dashboard,
    }))
    await get().fetchWidgetData(created.id)
  },

  updateWidget: async (widgetId, patch) => {
    const updated = await dashboardApi.updateWidget(widgetId, patch)
    set((state) => ({
      dashboard: state.dashboard
        ? {
            ...state.dashboard,
            widgets: upsertWidget(state.dashboard.widgets, updated),
          }
        : state.dashboard,
    }))
    if (shouldRefetchWidgetData(patch)) {
      await get().fetchWidgetData(widgetId)
    }
  },

  deleteWidget: async (widgetId) => {
    clearLayoutTimer(widgetId)
    await dashboardApi.deleteWidget(widgetId)
    set((state) => ({
      dashboard: state.dashboard
        ? {
            ...state.dashboard,
            widgets: state.dashboard.widgets.filter((item) => item.id !== widgetId),
          }
        : state.dashboard,
      widgetDataMap: Object.fromEntries(
        Object.entries(state.widgetDataMap).filter(([id]) => id !== widgetId),
      ),
    }))
  },

  updateLayout: (layouts) => {
    set((state) => {
      if (!state.dashboard) return state
      const nextWidgets = state.dashboard.widgets.map((widget) => {
        const layout = layouts.find((item) => item.i === widget.id)
        if (!layout) return widget
        return {
          ...widget,
          layout: {
            x: layout.x,
            y: layout.y,
            w: layout.w,
            h: layout.h,
          },
        }
      })
      return {
        dashboard: {
          ...state.dashboard,
          widgets: nextWidgets,
        },
      }
    })

    layouts.forEach((layout) => {
      clearLayoutTimer(layout.i)
      const timer = setTimeout(() => {
        void dashboardApi
          .updateWidget(layout.i, {
            layout: {
              x: layout.x,
              y: layout.y,
              w: layout.w,
              h: layout.h,
            },
          })
          .catch(() => {
            set({ error: '保存组件布局失败，请重试。' })
          })
      }, LAYOUT_SAVE_DEBOUNCE_MS)
      layoutSaveTimers.set(layout.i, timer)
    })
  },
}))

