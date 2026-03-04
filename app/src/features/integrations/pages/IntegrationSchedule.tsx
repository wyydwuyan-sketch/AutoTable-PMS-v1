import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Switch, Table, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useIntegrationsStore } from '../integrationStore'
import type { ApiConnector } from '../types'

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const CRON_PRESETS = [
  { label: '每 1 分钟（测试）', value: '* * * * *' },
  { label: '每天 08:00', value: '0 8 * * *' },
  { label: '工作日 08:00 / 12:00 / 18:00', value: '0 8,12,18 * * 1-5' },
  { label: '每 30 分钟', value: '*/30 * * * *' },
]

export default function IntegrationSchedule() {
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const connectors = useIntegrationsStore((state) => state.connectors)
  const updateSchedule = useIntegrationsStore((state) => state.updateSchedule)
  const [form] = Form.useForm<{ connectorId: string; cronExpr: string; scheduleEnabled: boolean }>()
  const [saving, setSaving] = useState(false)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (connectors.length === 0) return
    const target = connectors.find((item) => item.id === selectedConnectorId) ?? connectors[0]
    setSelectedConnectorId(target.id)
    form.setFieldsValue({
      connectorId: target.id,
      cronExpr: target.schedule.cronExpr,
      scheduleEnabled: target.schedule.isEnabled,
    })
  }, [connectors, form, selectedConnectorId])

  const selectedConnector = useMemo(
    () => connectors.find((item) => item.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId],
  )

  const columns: ColumnsType<ApiConnector> = [
    { title: '接口名称', dataIndex: 'name', key: 'name' },
    {
      title: 'Cron',
      key: 'cron',
      render: (_, record) => <Typography.Text className="ddi-mono">{record.schedule.cronExpr}</Typography.Text>,
    },
    {
      title: '调度开关',
      key: 'enabled',
      render: (_, record) => (record.schedule.isEnabled ? '已启用' : '已停用'),
    },
    {
      title: '下次执行',
      key: 'nextRunAt',
      render: (_, record) => formatDateTime(record.schedule.nextRunAt),
    },
  ]

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      await updateSchedule(values.connectorId, {
        cronExpr: values.cronExpr.trim(),
        isEnabled: values.scheduleEnabled,
      })
      message.success('调度配置已保存。')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存失败，请检查输入。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">调度规则</h1>
          <div className="ddi-page-subtitle">按接口维护 Cron 表达式与启停状态</div>
        </div>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={15}>
          <Card title="当前调度列表" styles={{ body: { padding: 0 } }}>
            <Table<ApiConnector>
              rowKey="id"
              columns={columns}
              dataSource={connectors}
              pagination={false}
              onRow={(record) => ({
                onClick: () => setSelectedConnectorId(record.id),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Card title="调度编辑器">
            <Form form={form} layout="vertical">
              <Form.Item label="接口" name="connectorId" rules={[{ required: true, message: '请选择接口' }]}>
                <Select
                  options={connectors.map((item) => ({ label: item.name, value: item.id }))}
                  onChange={(value) => {
                    setSelectedConnectorId(value)
                    const target = connectors.find((item) => item.id === value)
                    if (!target) return
                    form.setFieldsValue({
                      cronExpr: target.schedule.cronExpr,
                      scheduleEnabled: target.schedule.isEnabled,
                    })
                  }}
                />
              </Form.Item>
              <Form.Item label="Cron 表达式" name="cronExpr" rules={[{ required: true, message: '请输入 Cron' }]}>
                <Input className="ddi-mono" placeholder="例如 0 8 * * *" />
              </Form.Item>
              <Form.Item label="快捷模板">
                <Select
                  placeholder="选择后自动填入"
                  options={CRON_PRESETS}
                  onChange={(value) => form.setFieldValue('cronExpr', value)}
                />
              </Form.Item>
              <Form.Item label="启用调度" name="scheduleEnabled" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="停用" />
              </Form.Item>
            </Form>
            <Space style={{ marginTop: 8 }}>
              <Button type="primary" loading={saving} onClick={() => void handleSave()}>
                保存调度
              </Button>
            </Space>
            {selectedConnector ? (
              <Alert
                style={{ marginTop: 12 }}
                type="info"
                showIcon
                message={`当前接口：${selectedConnector.name}`}
                description={`下次执行时间：${formatDateTime(selectedConnector.schedule.nextRunAt)}`}
              />
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  )
}
