import { Button, Card, Col, Input, Row, Select, Space, Switch, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'

interface TemplateRow {
  id: string
  name: string
  type: '排班' | '列表'
  refCount: number
}

const TEMPLATE_ROWS: TemplateRow[] = [
  { id: 'excel_tpl_1', name: '排班表模板', type: '排班', refCount: 2 },
  { id: 'excel_tpl_2', name: '考勤模板', type: '列表', refCount: 1 },
  { id: 'excel_tpl_3', name: '月度排班模板', type: '排班', refCount: 1 },
]

export default function ExcelTemplate() {
  const columns: ColumnsType<TemplateRow> = [
    { title: '模板名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (value: TemplateRow['type']) => <Tag color={value === '排班' ? 'processing' : 'default'}>{value}</Tag>,
    },
    {
      title: '引用接口',
      dataIndex: 'refCount',
      key: 'refCount',
      width: 110,
      render: (value: number) => `${value} 个`,
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: () => (
        <Space>
          <Button size="small">编辑</Button>
          <Button size="small">预览</Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">输出模板</h1>
          <div className="ddi-page-subtitle">配置 Excel 导出模板和样式规则</div>
        </div>
        <Space>
          <Button>上传 .xlsx 模板</Button>
          <Button type="primary">新建模板</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={13}>
          <Card title="模板列表" styles={{ body: { padding: 0 } }}>
            <Table rowKey="id" columns={columns} dataSource={TEMPLATE_ROWS} pagination={false} />
          </Card>
        </Col>
        <Col xs={24} xl={11}>
          <Card title="排班表模板 · 样式配置">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>表格类型</div>
                <Select
                  style={{ width: '100%' }}
                  defaultValue="calendar"
                  options={[
                    { label: '排班表（日历式，横向日期）', value: 'calendar' },
                    { label: '列表式', value: 'list' },
                    { label: '数据透视', value: 'pivot' },
                  ]}
                />
              </div>
              <div>
                <div style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>表格标题</div>
                <Input defaultValue="{year}年{month}月员工排班表" />
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>冻结首行首列</span>
                  <Switch defaultChecked />
                </label>
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>自动列宽</span>
                  <Switch defaultChecked />
                </label>
              </div>
              <Button type="primary">保存样式配置</Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
