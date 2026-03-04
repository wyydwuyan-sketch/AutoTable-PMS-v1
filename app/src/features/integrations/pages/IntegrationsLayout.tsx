import { BellOutlined, DashboardOutlined, DeploymentUnitOutlined, FileTextOutlined, FolderOpenOutlined, ScheduleOutlined, SafetyOutlined, TableOutlined, UnorderedListOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Layout, Menu, Space } from 'antd'
import type { MenuProps } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import '../integrations.css'

const { Sider, Content } = Layout

const MENU_TO_PATH: Record<string, string> = {
  dashboard: '/integrations',
  list: '/integrations/list',
  create: '/integrations/list/create',
  schedule: '/integrations/schedule',
  logs: '/integrations/logs',
  files: '/integrations/files',
  credentials: '/integrations/credentials',
  uploadConfig: '/integrations/upload-config',
  notify: '/integrations/notify',
  fieldTemplate: '/integrations/field-template',
  excelTemplate: '/integrations/excel-template',
}

const resolveSelectedMenuKey = (pathname: string): keyof typeof MENU_TO_PATH => {
  if (pathname.startsWith('/integrations/list/create')) return 'create'
  if (pathname.startsWith('/integrations/list')) return 'list'
  if (pathname.startsWith('/integrations/schedule')) return 'schedule'
  if (pathname.startsWith('/integrations/logs')) return 'logs'
  if (pathname.startsWith('/integrations/files')) return 'files'
  if (pathname.startsWith('/integrations/credentials')) return 'credentials'
  if (pathname.startsWith('/integrations/upload-config')) return 'uploadConfig'
  if (pathname.startsWith('/integrations/notify')) return 'notify'
  if (pathname.startsWith('/integrations/field-template')) return 'fieldTemplate'
  if (pathname.startsWith('/integrations/excel-template')) return 'excelTemplate'
  return 'dashboard'
}

const menuItems: MenuProps['items'] = [
  { key: 'dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: 'list', icon: <UnorderedListOutlined />, label: '接口列表' },
  { key: 'create', icon: <DeploymentUnitOutlined />, label: '新建接口' },
  { key: 'schedule', icon: <ScheduleOutlined />, label: '调度规则' },
  { key: 'logs', icon: <UnorderedListOutlined />, label: '执行日志' },
  { key: 'files', icon: <FolderOpenOutlined />, label: '文件记录' },
  { key: 'credentials', icon: <SafetyOutlined />, label: '凭据管理' },
  { key: 'uploadConfig', icon: <UploadOutlined />, label: '上传配置' },
  { key: 'notify', icon: <BellOutlined />, label: '通知设置' },
  { key: 'fieldTemplate', icon: <FileTextOutlined />, label: '字段模板' },
  { key: 'excelTemplate', icon: <TableOutlined />, label: '输出模板' },
]

export default function IntegrationsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const selectedKey = resolveSelectedMenuKey(location.pathname)

  return (
    <div className="ddi-shell">
      <header className="ddi-app-header">
        <div className="ddi-brand">
          <div className="ddi-brand-mark">DDI</div>
          <div>
            <div className="ddi-brand-title">DDI接口配置中心</div>
            <div className="ddi-brand-sub">统一管理 API 接入、映射、调度与执行日志</div>
          </div>
        </div>
        <Space>
          <Button type="primary" onClick={() => navigate('/b/base_1/t/tbl_1/v/viw_1')}>
            返回数据表
          </Button>
        </Space>
      </header>
      <Layout className="ddi-body">
        <Sider className="ddi-sider" width={240} breakpoint="lg" collapsedWidth={0} theme="light">
          <div className="ddi-sider-head">
            <p className="ddi-sider-caption">配置页面</p>
          </div>
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[selectedKey]}
            onClick={(info) => {
              const targetPath = MENU_TO_PATH[info.key]
              if (targetPath) navigate(targetPath)
            }}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
          />
        </Sider>
        <Content className="ddi-content-wrap">
          <div className="ddi-content-card">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </div>
  )
}
