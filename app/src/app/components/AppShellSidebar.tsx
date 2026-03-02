import {
  DatabaseOutlined,
  DownOutlined,
  FormOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  RightOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { View } from '../../features/grid/types/grid'

type SidebarGroupKey = 'views' | 'configs' | 'systems'

type SidebarGroupState = Record<SidebarGroupKey, boolean>

export type SidebarConfigItem = {
  key: string
  icon: ReactNode
  label: string
  status?: 'enabled' | 'soon'
}

type SidebarViewGroup = {
  tableId: string
  tableName: string
  views: View[]
}

interface AppShellSidebarProps {
  sidebarCollapsed: boolean
  sidebarGroupsOpen: SidebarGroupState
  onToggleSidebarCollapsed: () => void
  onToggleSidebarGroup: (key: SidebarGroupKey) => void
  onOpenHome: () => void
  sidebarVisibleViews: View[]
  activeViewId: string
  activeTableId: string
  onOpenSidebarView: (view: View) => void
  tableNameMap: Map<string, { name: string; order: number }>
  dataViewConfigItems: SidebarConfigItem[]
  systemConfigItems: SidebarConfigItem[]
  activeConfigKey: string
  onOpenConfigRoute: (key: string) => void
}

const withCollapsedTooltip = (collapsed: boolean, title: ReactNode, node: ReactNode) => {
  if (!collapsed) {
    return node
  }
  return (
    <Tooltip placement="right" title={title}>
      <span style={{ display: 'block' }}>{node}</span>
    </Tooltip>
  )
}

export function AppShellSidebar({
  sidebarCollapsed,
  sidebarGroupsOpen,
  onToggleSidebarCollapsed,
  onToggleSidebarGroup,
  onOpenHome,
  sidebarVisibleViews,
  activeViewId,
  activeTableId,
  onOpenSidebarView,
  tableNameMap,
  dataViewConfigItems,
  systemConfigItems,
  activeConfigKey,
  onOpenConfigRoute,
}: AppShellSidebarProps) {
  const groupedSidebarViews = useMemo<SidebarViewGroup[]>(() => {
    const groups = new Map<string, SidebarViewGroup>()

    for (const view of sidebarVisibleViews) {
      const tableName = tableNameMap.get(view.tableId)?.name ?? '数据表'
      const current = groups.get(view.tableId)
      if (current) {
        current.views.push(view)
        continue
      }
      groups.set(view.tableId, {
        tableId: view.tableId,
        tableName,
        views: [view],
      })
    }

    return [...groups.values()].sort((a, b) => {
      const ao = tableNameMap.get(a.tableId)?.order ?? Number.MAX_SAFE_INTEGER
      const bo = tableNameMap.get(b.tableId)?.order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return a.tableName.localeCompare(b.tableName, 'zh-Hans-CN')
    })
  }, [sidebarVisibleViews, tableNameMap])

  const [viewTableGroupsOpen, setViewTableGroupsOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (groupedSidebarViews.length === 0) return
    setViewTableGroupsOpen((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const group of groupedSidebarViews) {
        const current = prev[group.tableId]
        if (typeof current === 'boolean') {
          next[group.tableId] = current
        } else {
          next[group.tableId] = group.tableId === activeTableId || groupedSidebarViews.length <= 2
          changed = true
        }
      }
      if (next[activeTableId] === false) {
        next[activeTableId] = true
        changed = true
      }
      const prevKeys = Object.keys(prev)
      if (prevKeys.length !== Object.keys(next).length) {
        changed = true
      }
      return changed ? next : prev
    })
  }, [activeTableId, groupedSidebarViews])

  const renderSidebarMenuItem = ({
    key,
    title,
    active = false,
    disabled = false,
    onClick,
    icon,
    label,
    nested = false,
    extra,
    ariaCurrent,
  }: {
    key: string
    title: string
    active?: boolean
    disabled?: boolean
    onClick?: () => void
    icon: ReactNode
    label: ReactNode
    nested?: boolean
    extra?: ReactNode
    ariaCurrent?: 'page'
  }) => {
    const button = (
      <button
        key={key}
        className={`sidebar-menu-item${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}${nested ? ' sidebar-menu-item--sub' : ''}`}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-current={ariaCurrent}
        title={sidebarCollapsed ? undefined : title}
        type="button"
      >
        <span className="sidebar-menu-icon">{icon}</span>
        {!sidebarCollapsed ? <span className="sidebar-menu-item-label">{label}</span> : null}
        {!sidebarCollapsed ? extra : null}
      </button>
    )

    return withCollapsedTooltip(sidebarCollapsed, title, button)
  }

  const renderConfigSection = (
    sectionKey: 'configs' | 'systems',
    title: string,
    items: SidebarConfigItem[],
  ) => {
    if (items.length === 0) return null

    return (
      <div className="sidebar-section">
        {!sidebarCollapsed ? (
          <button
            type="button"
            className="sidebar-section-toggle"
            onClick={() => onToggleSidebarGroup(sectionKey)}
            aria-expanded={sidebarGroupsOpen[sectionKey]}
          >
            {sidebarGroupsOpen[sectionKey] ? <DownOutlined /> : <RightOutlined />}
            <span>{title}</span>
          </button>
        ) : null}
        {(!sidebarCollapsed || sidebarGroupsOpen[sectionKey]) ? (
          <div className="sidebar-menu">
            {items.map((item) =>
              renderSidebarMenuItem({
                key: item.key,
                title: item.label,
                active: item.status !== 'soon' && item.key === activeConfigKey,
                disabled: item.status === 'soon',
                onClick: () => onOpenConfigRoute(item.key),
                icon: item.icon,
                label: item.label,
                extra: item.status === 'soon' ? <span className="sidebar-soon-badge">Soon</span> : null,
              }),
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <aside
      className="app-shell-sidebar"
      style={{
        width: sidebarCollapsed ? 74 : 252,
        borderRight: '1px solid var(--border-color)',
        overflowY: 'auto',
        background: 'var(--bg-sidebar)',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}
    >
      <div className="sidebar-shell">
        <div className="sidebar-top-actions">
          {!sidebarCollapsed ? (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>导航</span>
          ) : (
            <span />
          )}
          <button
            className="cm-btn cm-btn--sm"
            onClick={onToggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            type="button"
          >
            {sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-menu">
            {renderSidebarMenuItem({
              key: 'home',
              title: '首页',
              onClick: onOpenHome,
              icon: <HomeOutlined />,
              label: '首页',
            })}
          </div>
        </div>

        <div className="sidebar-section">
          {!sidebarCollapsed ? (
            <button
              type="button"
              className="sidebar-section-toggle"
              onClick={() => onToggleSidebarGroup('views')}
              aria-expanded={sidebarGroupsOpen.views}
            >
              {sidebarGroupsOpen.views ? <DownOutlined /> : <RightOutlined />}
              <span>视图列表</span>
            </button>
          ) : null}
          {(!sidebarCollapsed || sidebarGroupsOpen.views) ? (
            <div className="sidebar-menu">
              {groupedSidebarViews.length === 0 ? (
                <div className="sidebar-menu-item is-disabled" style={{ opacity: 0.5, cursor: 'default' }}>
                  {!sidebarCollapsed ? <span className="sidebar-menu-item-label">暂无可用视图</span> : null}
                </div>
              ) : sidebarCollapsed ? (
                groupedSidebarViews.flatMap((group) =>
                  group.views.map((view) =>
                    renderSidebarMenuItem({
                      key: `view:${view.id}`,
                      title: `${group.tableName} / ${view.name}`,
                      active: view.id === activeViewId && view.tableId === activeTableId,
                      onClick: () => onOpenSidebarView(view),
                      icon: view.type === 'form' ? <FormOutlined /> : <TableOutlined />,
                      label: view.name,
                      ariaCurrent: view.id === activeViewId && view.tableId === activeTableId ? 'page' : undefined,
                    }),
                  ),
                )
              ) : (
                groupedSidebarViews.map((group) => {
                  const isGroupOpen = viewTableGroupsOpen[group.tableId] !== false
                  const hasActiveView = group.views.some(
                    (view) => view.id === activeViewId && view.tableId === activeTableId,
                  )

                  return (
                    <div
                      key={`table-group:${group.tableId}`}
                      className={`sidebar-subgroup${hasActiveView ? ' is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="sidebar-subgroup-toggle"
                        onClick={() =>
                          setViewTableGroupsOpen((prev) => ({
                            ...prev,
                            [group.tableId]: !(prev[group.tableId] !== false),
                          }))
                        }
                        aria-expanded={isGroupOpen}
                      >
                        <span className="sidebar-subgroup-caret" aria-hidden="true">
                          {isGroupOpen ? <DownOutlined /> : <RightOutlined />}
                        </span>
                        <span className="sidebar-menu-icon"><DatabaseOutlined /></span>
                        <span className="sidebar-subgroup-title">{group.tableName}</span>
                      </button>
                      {isGroupOpen ? (
                        <div className="sidebar-menu sidebar-menu--nested">
                          {group.views.map((view) =>
                            renderSidebarMenuItem({
                              key: `view:${view.id}`,
                              title: `${group.tableName} / ${view.name}`,
                              active: view.id === activeViewId && view.tableId === activeTableId,
                              onClick: () => onOpenSidebarView(view),
                              icon: view.type === 'form' ? <FormOutlined /> : <TableOutlined />,
                              label: view.name,
                              nested: true,
                              ariaCurrent: view.id === activeViewId && view.tableId === activeTableId ? 'page' : undefined,
                            }),
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </div>

        {renderConfigSection('configs', '配置管理', dataViewConfigItems)}
        {renderConfigSection('systems', '系统设置', systemConfigItems)}
      </div>
    </aside>
  )
}
