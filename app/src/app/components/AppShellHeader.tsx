import { DashboardOutlined, DownOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons'
import { DropdownMenu } from '../../features/grid/components/DropdownMenu'
import type { DropdownMenuItem } from '../../features/grid/components/DropdownMenu'

interface AppShellHeaderProps {
  currentTenantName?: string | null
  isDarkMode: boolean
  onOpenDashboard: () => void
  onToggleThemeMode: () => void
  userMenuItems: DropdownMenuItem[]
  onUserMenuSelect: (key: string) => void
  username?: string | null
}

export function AppShellHeader({
  currentTenantName,
  isDarkMode,
  onOpenDashboard,
  onToggleThemeMode,
  userMenuItems,
  onUserMenuSelect,
  username,
}: AppShellHeaderProps) {
  return (
    <header
      className="app-shell-header"
      style={{
        background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border-color)',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
        height: 56,
        flexShrink: 0,
      }}
    >
      <div className="app-shell-header-left">
        <div className="app-shell-brand" aria-label="AtuoTable 品牌标识">
          <div className="app-shell-brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="app-shell-brand-text">
            <strong>AtuoTable</strong>
            <span>{currentTenantName ?? '工作区'}</span>
          </div>
        </div>
      </div>
      <div className="app-shell-header-right">
        <button className="cm-btn" onClick={onOpenDashboard}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <DashboardOutlined />
            <span>大屏</span>
          </span>
        </button>
        <button
          className="cm-btn"
          onClick={onToggleThemeMode}
          aria-label="切换亮暗主题"
          title={isDarkMode ? '切换为亮色模式' : '切换为暗色模式'}
        >
          {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
        </button>
        <span className="app-header-separator" aria-hidden="true" />
        <DropdownMenu items={userMenuItems} onSelect={onUserMenuSelect}>
          <button className="app-user-trigger cm-btn" type="button" style={{ gap: 8 }}>
            <span className="app-user-avatar">{(username ?? 'U').slice(0, 1).toUpperCase()}</span>
            <span className="app-user-trigger-name">{username ?? '未登录'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}><DownOutlined /></span>
          </button>
        </DropdownMenu>
      </div>
    </header>
  )
}
