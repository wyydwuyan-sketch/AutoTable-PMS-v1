import { Button, Card, Col, Empty, Row, Space, Tag } from 'antd'

interface TemplateCard {
  id: string
  name: string
  fields: Array<{ key: string; label: string }>
  usageCount: number
}

const TEMPLATES: TemplateCard[] = [
  {
    id: 'tpl_emp_base',
    name: '员工基础信息',
    fields: [
      { key: 'emp_id', label: '工号' },
      { key: 'emp_name', label: '姓名' },
      { key: 'dept', label: '部门' },
      { key: 'position', label: '职位' },
      { key: 'phone', label: '联系电话' },
    ],
    usageCount: 3,
  },
  {
    id: 'tpl_shift_standard',
    name: '排班标准字段',
    fields: [
      { key: 'work_date', label: '工作日期' },
      { key: 'shift_type', label: '班次（枚举）' },
      { key: 'start_time', label: '开始时间' },
      { key: 'end_time', label: '结束时间' },
    ],
    usageCount: 5,
  },
]

export default function FieldTemplate() {
  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">字段模板</h1>
          <div className="ddi-page-subtitle">沉淀可复用的字段映射模板，减少重复配置</div>
        </div>
        <Button type="primary">新建模板</Button>
      </div>

      <Row gutter={[12, 12]}>
        {TEMPLATES.map((template) => (
          <Col key={template.id} xs={24} md={12} xl={8}>
            <Card
              title={template.name}
              extra={<Tag>{template.fields.length} 字段</Tag>}
              actions={[<span key="edit">编辑</span>, <span key="refs">引用 ({template.usageCount})</span>]}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {template.fields.map((field) => (
                  <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tag className="ddi-mono">{field.key}</Tag>
                    <span style={{ color: 'var(--text-secondary)' }}>→ {field.label}</span>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        ))}

        <Col xs={24} md={12} xl={8}>
          <Card>
            <Empty description="新建字段模板" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button type="dashed">创建</Button>
            </Empty>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
