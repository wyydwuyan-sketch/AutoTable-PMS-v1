import {
  DatabaseOutlined,
  DownOutlined,
  FolderOpenOutlined,
  HomeOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RightOutlined,
  TableOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import { useEffect, useState, type ReactNode } from 'react'
import type { View } from '../../features/grid/types/grid'

type SidebarGroupKey = 'views' | 'configs' | 'systems'

type SidebarGroupState = Record<SidebarGroupKey, boolean>

export type SidebarConfigItem = {
  key: string
  icon: ReactNode
  label: string
  status?: 'enabled' | 'soon'
}

type SidebarFolderItem = {
  id: string
  tableId: string
  tableName: string
  name: string
  primaryViews: View[]
}

interface AppShellSidebarProps {
  sidebarCollapsed: boolean
  sidebarGroupsOpen: SidebarGroupState
  onToggleSidebarCollapsed: () => void
  onToggleSidebarGroup: (key: SidebarGroupKey) => void
  onOpenHome: () => void
  canCreateTable: boolean
  isCreatingTable?: boolean
  onCreateTable: () => void
  sidebarFolders: SidebarFolderItem[]
  activePrimaryViewId: string
  activeFolderId: string | null
  onOpenSidebarView: (view: View) => void
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
  canCreateTable,
  isCreatingTable = false,
  onCreateTable,
  sidebarFolders,
  activePrimaryViewId,
  activeFolderId,
  onOpenSidebarView,
  dataViewConfigItems,
  systemConfigItems,
  activeConfigKey,
  onOpenConfigRoute,
}: AppShellSidebarProps) {
  const [folderGroupsOpen, setFolderGroupsOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (sidebarFolders.length === 0) return
    setFolderGroupsOpen((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const folder of sidebarFolders) {
        const current = prev[folder.id]
        if (typeof current === 'boolean') {
          next[folder.id] = current
        } else {
          next[folder.id] = folder.id === activeFolderId || sidebarFolders.length <= 2
          changed = true
        }
      }
      if (activeFolderId && next[activeFolderId] === false) {
        next[activeFolderId] = true
        changed = true
      }
      if (Object.keys(prev).length !== Object.keys(next).length) {
        changed = true
      }
      return changed ? next : prev
    })
  }, [activeFolderId, sidebarFolders])

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
              {canCreateTable
                ? renderSidebarMenuItem({
                  key: 'create-table',
                  title: '新增数据表',
                  onClick: onCreateTable,
                  icon: <PlusOutlined />,
                  label: isCreatingTable ? '创建中...' : '新增数据表',
                  disabled: isCreatingTable,
                })
                : null}
              {sidebarFolders.length === 0 ? (
                <div className="sidebar-menu-item is-disabled" style={{ opacity: 0.5, cursor: 'default' }}>
                  {!sidebarCollapsed ? <span className="sidebar-menu-item-label">暂无可用视图</span> : null}
                </div>
              ) : sidebarCollapsed ? (
                sidebarFolders.flatMap((folder) =>
                  folder.primaryViews.map((view) =>
                    renderSidebarMenuItem({
                      key: `view:${view.id}`,
                      title: `${folder.name} / ${view.name}`,
                      active: view.id === activePrimaryViewId,
                      onClick: () => onOpenSidebarView(view),
                      icon: <TableOutlined />,
                      label: view.name,
                      ariaCurrent: view.id === activePrimaryViewId ? 'page' : undefined,
                    }),
                  ),
                )
              ) : (
                sidebarFolders.map((folder) => {
                  const isFolderOpen = folderGroupsOpen[folder.id] !== false
                  const hasActiveView = folder.primaryViews.some((view) => view.id === activePrimaryViewId)

                  return (
                    <div
                      key={`folder-group:${folder.id}`}
                      className={`sidebar-subgroup${hasActiveView ? ' is-active' : ''}`}
                    >
                      <button
                        type="button"
                        className="sidebar-subgroup-toggle"
                        onClick={() =>
                          setFolderGroupsOpen((prev) => ({
                            ...prev,
                            [folder.id]: !(prev[folder.id] !== false),
                          }))
                        }
                        aria-expanded={isFolderOpen}
                        title={folder.tableName}
                      >
                        <span className="sidebar-subgroup-caret" aria-hidden="true">
                          {isFolderOpen ? <DownOutlined /> : <RightOutlined />}
                        </span>
                        <span className="sidebar-menu-icon"><FolderOpenOutlined /></span>
                        <span className="sidebar-subgroup-title">{folder.name}</span>
                      </button>
                      {isFolderOpen ? (
                        <div className="sidebar-menu sidebar-menu--nested">
                          {folder.primaryViews.map((view) =>
                            renderSidebarMenuItem({
                              key: `view:${view.id}`,
                              title: `${folder.name} / ${view.name}`,
                              active: view.id === activePrimaryViewId,
                              onClick: () => onOpenSidebarView(view),
                              icon: <DatabaseOutlined />,
                              label: view.name,
                              nested: true,
                              ariaCurrent: view.id === activePrimaryViewId ? 'page' : undefined,
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
