import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Steps, Switch, message } from 'antd'
import type { FormInstance } from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { tableItems } from '../../../config/tables'
import { useIntegrationsStore } from '../integrationStore'
import type { AuthType, ConnectorCreatePayload, ConnectorMode, HttpMethod } from '../types'

type MappingInput = {
  sourceKey: string
  targetFieldId: string
  transform?: string
}

interface ConnectorFormValues {
  name: string
  tableId: string
  description?: string
  mode: ConnectorMode
  method: HttpMethod
  url: string
  authType: AuthType
  credentialId?: string
  responsePath?: string
  requestParamsText?: string
  fieldMappings: MappingInput[]
  cronExpr: string
  scheduleEnabled: boolean
  connectorEnabled: boolean
}

const METHOD_OPTIONS: Array<{ label: string; value: HttpMethod }> = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
]

const AUTH_OPTIONS: Array<{ label: string; value: AuthType }> = [
  { label: '无认证', value: 'none' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'API Key', value: 'api_key' },
]

const STEP_ITEMS = [
  { title: '基本信息' },
  { title: '请求配置' },
  { title: '字段映射' },
  { title: '调度设置' },
]

const validateStep = async (step: number, form: FormInstance<ConnectorFormValues>) => {
  if (step === 0) {
    await form.validateFields(['name', 'tableId', 'mode'])
  }
  if (step === 1) {
    await form.validateFields(['method', 'url', 'authType'])
  }
  if (step === 2) {
    const mappings = (form.getFieldValue('fieldMappings') ?? []) as MappingInput[]
    if (mappings.length === 0) {
      throw new Error('请至少配置一条字段映射。')
    }
    const fieldsToCheck = mappings.flatMap((_, index) => [
      ['fieldMappings', index, 'sourceKey'],
      ['fieldMappings', index, 'targetFieldId'],
    ])
    await form.validateFields(fieldsToCheck)
  }
  if (step === 3) {
    await form.validateFields(['cronExpr'])
  }
}

const parseParams = (text?: string) => {
  if (!text || text.trim() === '') return {}
  try {
    const value = JSON.parse(text) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('请求参数必须是 JSON 对象。')
    }
    const entries = Object.entries(value as Record<string, unknown>).map(([key, raw]) => [key, String(raw)])
    return Object.fromEntries(entries)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '请求参数 JSON 解析失败。')
  }
}

export default function IntegrationCreate() {
  const navigate = useNavigate()
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const credentials = useIntegrationsStore((state) => state.credentials)
  const createConnector = useIntegrationsStore((state) => state.createConnector)
  const getFieldOptionsForTable = useIntegrationsStore((state) => state.getFieldOptionsForTable)
  const [form] = Form.useForm<ConnectorFormValues>()
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const selectedTableId = Form.useWatch('tableId', form)
  const selectedAuthType = Form.useWatch('authType', form)

  const fieldOptions = useMemo(
    () => getFieldOptionsForTable(selectedTableId ?? tableItems[0]?.id ?? 'tbl_1'),
    [getFieldOptionsForTable, selectedTableId],
  )

  const credentialOptions = useMemo(
    () => credentials.map((item) => ({ label: `${item.name} (${item.authType})`, value: item.id })),
    [credentials],
  )

  const goNext = async () => {
    try {
      await validateStep(step, form)
      setStep((current) => Math.min(current + 1, STEP_ITEMS.length - 1))
    } catch (error) {
      message.error(error instanceof Error ? error.message : '请先补全当前步骤必填项。')
    }
  }

  const goPrev = () => setStep((current) => Math.max(current - 1, 0))

  const handleSubmit = async () => {
    try {
      await form.validateFields()
      const values = form.getFieldsValue(true)
      const requestParams = parseParams(values.requestParamsText)
      const targetLabelMap = new Map(fieldOptions.map((item) => [item.id, item.label]))
      const mappingValues = (values.fieldMappings ?? []) as MappingInput[]
      const payload: ConnectorCreatePayload = {
        name: values.name,
        description: values.description,
        tableId: values.tableId,
        mode: values.mode,
        method: values.method,
        url: values.url,
        authType: values.authType,
        credentialId: values.authType === 'none' ? null : values.credentialId ?? null,
        requestParams,
        responsePath: values.responsePath?.trim() ? values.responsePath.trim() : null,
        fieldMappings: mappingValues.map((mapping) => ({
          sourceKey: mapping.sourceKey,
          targetFieldId: mapping.targetFieldId,
          targetFieldLabel: targetLabelMap.get(mapping.targetFieldId) ?? mapping.targetFieldId,
          transform: mapping.transform?.trim() ? mapping.transform.trim() : undefined,
        })),
        schedule: {
          cronExpr: values.cronExpr,
          isEnabled: values.scheduleEnabled,
        },
        isEnabled: values.connectorEnabled,
      }
      setSubmitting(true)
      await createConnector(payload)
      message.success('接口创建完成。')
      navigate('/integrations/list')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败，请检查输入。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">新建接口</h1>
          <div className="ddi-page-subtitle">通过四步向导创建 DDI 接口配置</div>
        </div>
      </div>

      <Steps current={step} items={STEP_ITEMS} style={{ marginBottom: 16 }} />

      <Form<ConnectorFormValues>
        form={form}
        layout="vertical"
        initialValues={{
          name: '',
          tableId: tableItems[0]?.id ?? 'tbl_1',
          description: '',
          mode: 'config',
          method: 'GET',
          url: '',
          authType: 'none',
          responsePath: 'data.items',
          requestParamsText: '{\n  "date": "{today}"\n}',
          fieldMappings: [{ sourceKey: 'name', targetFieldId: fieldOptions[0]?.id ?? 'name' }],
          cronExpr: '0 8 * * *',
          scheduleEnabled: true,
          connectorEnabled: true,
        }}
      >
        {step === 0 ? (
          <Card title="基本信息">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="接口名称" name="name" rules={[{ required: true, message: '请输入接口名称' }]}>
                  <Input placeholder="例如：员工排班同步" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="绑定数据表" name="tableId" rules={[{ required: true, message: '请选择目标表' }]}>
                  <Select options={tableItems.map((item) => ({ label: item.name, value: item.id }))} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="接口模式" name="mode" rules={[{ required: true, message: '请选择模式' }]}>
                  <Select
                    options={[
                      { label: '配置模式（推荐）', value: 'config' },
                      { label: '插件模式', value: 'plugin' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="接口状态" name="connectorEnabled" valuePropName="checked">
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="描述" name="description">
              <Input.TextArea rows={3} placeholder="接口用途与说明" />
            </Form.Item>
          </Card>
        ) : null}

        {step === 1 ? (
          <Card title="请求配置">
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item label="请求方法" name="method" rules={[{ required: true }]}>
                  <Select options={METHOD_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item label="认证方式" name="authType" rules={[{ required: true }]}>
                  <Select options={AUTH_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item
                  label="凭据"
                  name="credentialId"
                  rules={
                    selectedAuthType && selectedAuthType !== 'none'
                      ? [{ required: true, message: '请选择凭据' }]
                      : undefined
                  }
                >
                  <Select options={credentialOptions} allowClear placeholder="可选，认证方式为 none 时可留空" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="请求 URL" name="url" rules={[{ required: true, message: '请输入 URL' }]}>
              <Input className="ddi-mono" placeholder="https://api.example.com/data" />
            </Form.Item>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="响应数据路径" name="responsePath">
                  <Input className="ddi-mono" placeholder="例如 data.items" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Alert
                  type="info"
                  showIcon
                  message="变量提示"
                  description="支持 {today}、{yesterday}、{year}、{month}，可用于请求参数。"
                />
              </Col>
            </Row>
            <Form.Item label="请求参数 JSON" name="requestParamsText">
              <Input.TextArea className="ddi-mono" rows={8} />
            </Form.Item>
          </Card>
        ) : null}

        {step === 2 ? (
          <Card title="字段映射">
            <Form.List name="fieldMappings">
              {(fields, { add, remove }) => (
                <div style={{ display: 'grid', gap: 10 }}>
                  {fields.map((field) => (
                    <Row key={field.key} gutter={8} align="middle">
                      <Col xs={24} md={8}>
                        <Form.Item
                          label={field.name === 0 ? '源字段 Key' : undefined}
                          name={[field.name, 'sourceKey']}
                          rules={[{ required: true, message: '请输入源字段 key' }]}
                        >
                          <Input className="ddi-mono" placeholder="例如 employeeName" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Form.Item
                          label={field.name === 0 ? '目标字段' : undefined}
                          name={[field.name, 'targetFieldId']}
                          rules={[{ required: true, message: '请选择目标字段' }]}
                        >
                          <Select
                            options={fieldOptions.map((item) => ({
                              label: `${item.label} (${item.id})`,
                              value: item.id,
                            }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={6}>
                        <Form.Item label={field.name === 0 ? '转换规则' : undefined} name={[field.name, 'transform']}>
                          <Input className="ddi-mono" placeholder="例如 date:YYYY-MM-DD" />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={2}>
                        <Button
                          icon={<MinusCircleOutlined />}
                          danger
                          onClick={() => remove(field.name)}
                          style={{ marginTop: field.name === 0 ? 30 : 0 }}
                        />
                      </Col>
                    </Row>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ sourceKey: '', targetFieldId: fieldOptions[0]?.id ?? '' })}
                  >
                    新增映射
                  </Button>
                </div>
              )}
            </Form.List>
            <div style={{ marginTop: 14 }}>
              <h4 className="ddi-card-title">响应预览（示例）</h4>
              <div className="ddi-code-block ddi-mono">
                {`{
  "code": 0,
  "data": {
    "items": [
      { "employeeName": "张三", "shiftName": "早班", "workDate": "2026-03-04" }
    ]
  }
}`}
              </div>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card title="调度设置">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item label="Cron 表达式" name="cronExpr" rules={[{ required: true, message: '请输入 Cron' }]}>
                  <Input className="ddi-mono" placeholder="例如 0 8 * * *" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item label="启用调度" name="scheduleEnabled" valuePropName="checked">
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Alert type="warning" showIcon message="后端未接入前，调度仅演示配置保存" />
              </Col>
            </Row>
            <Alert
              type="info"
              showIcon
              message="推荐先手动执行一次"
              description="创建后可在“接口列表”点击“手动执行”，验证映射和入库行为。"
            />
          </Card>
        ) : null}
      </Form>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <Button onClick={() => navigate('/integrations/list')}>取消</Button>
        <Space>
          <Button onClick={goPrev} disabled={step === 0}>
            上一步
          </Button>
          {step < STEP_ITEMS.length - 1 ? (
            <Button type="primary" onClick={() => void goNext()}>
              下一步
            </Button>
          ) : (
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              创建接口
            </Button>
          )}
        </Space>
      </div>
    </div>
  )
}
