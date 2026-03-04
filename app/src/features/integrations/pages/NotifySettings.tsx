import { Alert, Button, Card, Col, Form, Input, Row, Switch, message } from 'antd'

interface NotifyValues {
  mailEnabled: boolean
  smtpServer: string
  sender: string
  receivers: string
  dingEnabled: boolean
  webhookUrl: string
  notifyOnFailed: boolean
  notifyOnRetryExhausted: boolean
  notifyDailySummary: boolean
  notifyUploadFailed: boolean
  notifyCredentialExpire: boolean
}

export default function NotifySettings() {
  const [form] = Form.useForm<NotifyValues>()

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">通知设置</h1>
          <div className="ddi-page-subtitle">管理邮件、Webhook 与通知触发规则</div>
        </div>
        <Button
          type="primary"
          onClick={() => {
            void form.validateFields().then(() => message.success('通知配置已保存（前端演示）。'))
          }}
        >
          保存设置
        </Button>
      </div>

      <Form<NotifyValues>
        form={form}
        layout="vertical"
        initialValues={{
          mailEnabled: true,
          smtpServer: 'smtp.example.com:465',
          sender: 'noreply@example.com',
          receivers: 'admin@example.com,ops@example.com',
          dingEnabled: false,
          webhookUrl: '',
          notifyOnFailed: true,
          notifyOnRetryExhausted: true,
          notifyDailySummary: false,
          notifyUploadFailed: false,
          notifyCredentialExpire: true,
        }}
      >
        <Row gutter={[12, 12]}>
          <Col xs={24} xl={12}>
            <Card title="邮件通知">
              <Form.Item label="启用邮件" name="mailEnabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="SMTP 服务器" name="smtpServer">
                <Input className="ddi-mono" />
              </Form.Item>
              <Form.Item label="发件人" name="sender">
                <Input />
              </Form.Item>
              <Form.Item label="收件人（逗号分隔）" name="receivers">
                <Input />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card title="Webhook 通知">
              <Form.Item label="启用 Webhook" name="dingEnabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="Webhook 地址" name="webhookUrl">
                <Input className="ddi-mono" placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
              </Form.Item>
              <Alert showIcon type="info" message="可接入钉钉 / 企业微信 / 自定义 Webhook" />
            </Card>
          </Col>
        </Row>

        <Card title="通知触发规则" style={{ marginTop: 12 }}>
          <Row gutter={[12, 12]}>
            <Col xs={24} md={12}>
              <Form.Item label="任务执行失败" name="notifyOnFailed" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="重试次数耗尽" name="notifyOnRetryExhausted" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="每日执行汇总" name="notifyDailySummary" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="FTP 上传失败" name="notifyUploadFailed" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="凭据即将过期" name="notifyCredentialExpire" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Card>
      </Form>
    </div>
  )
}
