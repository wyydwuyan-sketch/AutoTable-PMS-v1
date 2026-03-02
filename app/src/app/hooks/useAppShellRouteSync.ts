import { useCallback, useEffect, useRef } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { FilterCondition, FilterLogic, SortCondition, View, ViewConfig } from '../../features/grid/types/grid'
import { buildViewPath } from '../../features/grid/utils/viewRouting'

type ShareQuery = {
  filterLogic: FilterLogic
  filters: FilterCondition[]
  sorts: SortCondition[]
}

interface UseAppShellRouteSyncParams {
  baseId: string
  tableId: string
  viewId: string
  pathname: string
  search: string
  views: View[]
  visibleViews: View[]
  navigate: NavigateFunction
  updateViewConfig: (config: Partial<ViewConfig>) => void
  canViewBusinessConfig: boolean
  isViewManageRoute: boolean
  isComponentsRoute: boolean
  isShowcaseRoute: boolean
  isWorkflowRoute: boolean
  isDashboardConfigRoute: boolean
  isMembersRoute: boolean
  isAiModelsRoute: boolean
}

export function useAppShellRouteSync({
  baseId,
  tableId,
  viewId,
  pathname,
  search,
  views,
  visibleViews,
  navigate,
  updateViewConfig,
  canViewBusinessConfig,
  isViewManageRoute,
  isComponentsRoute,
  isShowcaseRoute,
  isWorkflowRoute,
  isDashboardConfigRoute,
  isMembersRoute,
  isAiModelsRoute,
}: UseAppShellRouteSyncParams) {
  const appliedShareQueryRef = useRef(false)

  const navigateToView = useCallback(
    (targetView: View, replace = false) => {
      navigate(buildViewPath(baseId, targetView.tableId, targetView), { replace })
    },
    [baseId, navigate],
  )

  const openSidebarView = useCallback(
    (targetView: View) => {
      navigate(buildViewPath(baseId, targetView.tableId, targetView))
    },
    [baseId, navigate],
  )

  useEffect(() => {
    const routeView = views.find((view) => view.id === viewId)
    if (!routeView) {
      return
    }
    const viewBasePath = `/b/${baseId}/t/${tableId}/v/${viewId}`
    const isBareViewPath = pathname === viewBasePath || pathname === `${viewBasePath}/`
    if (!isBareViewPath) {
      return
    }
    if (routeView.type === 'form' || routeView.type === 'kanban') {
      navigateToView(routeView, true)
    }
  }, [baseId, navigateToView, pathname, tableId, viewId, views])

  useEffect(() => {
    if (appliedShareQueryRef.current) return

    const params = new URLSearchParams(search)
    const q = params.get('q')
    if (!q) return

    try {
      const parsed = JSON.parse(decodeURIComponent(q)) as Partial<ShareQuery>
      const logic = parsed.filterLogic === 'or' ? 'or' : 'and'
      updateViewConfig({
        filterLogic: logic,
        filters: Array.isArray(parsed.filters) ? parsed.filters : [],
        sorts: Array.isArray(parsed.sorts) ? parsed.sorts : [],
      })
      appliedShareQueryRef.current = true
    } catch {
      // ignore malformed share query
      appliedShareQueryRef.current = true
    }
  }, [search, updateViewConfig])

  const openView = useCallback(
    (targetViewId: string) => {
      const target = visibleViews.find((view) => view.id === targetViewId)
      if (!target) return
      navigateToView(target)
    },
    [navigateToView, visibleViews],
  )

  useEffect(() => {
    const isConfigRoute =
      isViewManageRoute ||
      isComponentsRoute ||
      isShowcaseRoute ||
      isWorkflowRoute ||
      isDashboardConfigRoute ||
      isMembersRoute ||
      isAiModelsRoute
    if (isConfigRoute) return
    if (visibleViews.length === 0) return
    if (visibleViews.some((item) => item.id === viewId)) return
    openView(visibleViews[0].id)
  }, [
    isAiModelsRoute,
    isComponentsRoute,
    isDashboardConfigRoute,
    isMembersRoute,
    isShowcaseRoute,
    isViewManageRoute,
    isWorkflowRoute,
    openView,
    viewId,
    visibleViews,
  ])

  useEffect(() => {
    if (canViewBusinessConfig) return
    if (
      !isViewManageRoute &&
      !isComponentsRoute &&
      !isShowcaseRoute &&
      !isWorkflowRoute &&
      !isDashboardConfigRoute &&
      !isMembersRoute &&
      !isAiModelsRoute
    ) {
      return
    }
    const fallbackView = visibleViews[0]
    if (fallbackView) {
      navigate(buildViewPath(baseId, fallbackView.tableId, fallbackView), { replace: true })
      return
    }
    navigate(`/b/${baseId}/t/${tableId}/v/${viewId}`, { replace: true })
  }, [
    baseId,
    canViewBusinessConfig,
    isAiModelsRoute,
    isComponentsRoute,
    isDashboardConfigRoute,
    isMembersRoute,
    isShowcaseRoute,
    isViewManageRoute,
    isWorkflowRoute,
    navigate,
    tableId,
    viewId,
    visibleViews,
  ])

  return {
    openSidebarView,
  }
}
