import { Alert, Button, Card, Col, Form, Input, Row, Select, Space, Switch, Tag, message } from 'antd'

interface UploadConfigValues {
  host: string
  port: string
  credentialName: string
  transferMode: 'pasv' | 'port'
  timeout: string
  sameNameStrategy: 'overwrite' | 'suffix' | 'skip'
  retryCount: string
  retryInterval: string
  verifySize: boolean
  keepLocalCopy: boolean
  rootPath: string
}

export default function UploadConfig() {
  const [form] = Form.useForm<UploadConfigValues>()

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">上传配置</h1>
          <div className="ddi-page-subtitle">配置 FTP 上传策略与目录命名规则</div>
        </div>
        <Button
          type="primary"
          onClick={() => {
            void form.validateFields().then(() => message.success('上传配置已保存（前端演示）。'))
          }}
        >
          保存配置
        </Button>
      </div>

      <Row gutter={[12, 12]}>
        <Col xs={24} xl={13}>
          <Card title="FTP 服务器配置">
            <Form<UploadConfigValues>
              form={form}
              layout="vertical"
              initialValues={{
                host: 'ftp.example.com',
                port: '21',
                credentialName: 'FTP 服务器账号',
                transferMode: 'pasv',
                timeout: '30',
                sameNameStrategy: 'overwrite',
                retryCount: '3',
                retryInterval: '10',
                verifySize: true,
                keepLocalCopy: true,
                rootPath: '/reports',
              }}
            >
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item label="服务器地址" name="host" rules={[{ required: true, message: '请输入服务器地址' }]}>
                    <Input className="ddi-mono" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
                    <Input className="ddi-mono" />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item label="账号凭据" name="credentialName">
                    <Select options={[{ label: 'FTP 服务器账号', value: 'FTP 服务器账号' }]} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="传输模式" name="transferMode">
                    <Select
                      options={[
                        { label: '被动模式（PASV）', value: 'pasv' },
                        { label: '主动模式（PORT）', value: 'port' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item label="连接超时（秒）" name="timeout">
                    <Input className="ddi-mono" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Space style={{ marginTop: 30 }}>
                    <Button>测试连接</Button>
                  </Space>
                </Col>
              </Row>
            </Form>
          </Card>
        </Col>

        <Col xs={24} xl={11}>
          <Card title="上传策略">
            <Form form={form} layout="vertical">
              <Form.Item label="同名文件处理" name="sameNameStrategy">
                <Select
                  options={[
                    { label: '覆盖旧文件', value: 'overwrite' },
                    { label: '自动加序号', value: 'suffix' },
                    { label: '跳过不上传', value: 'skip' },
                  ]}
                />
              </Form.Item>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item label="失败重试次数" name="retryCount">
                    <Input className="ddi-mono" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="重试间隔（秒）" name="retryInterval">
                    <Input className="ddi-mono" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="上传后校验文件大小" name="verifySize" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item label="保留本地副本" name="keepLocalCopy" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Form>
          </Card>
          <Card title="目录与命名规则" style={{ marginTop: 12 }}>
            <Form form={form} layout="vertical">
              <Form.Item label="根目录" name="rootPath">
                <Input className="ddi-mono" />
              </Form.Item>
            </Form>
            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
              <div className="ddi-code-block ddi-mono">/reports/schedule/{'{year}'}/{'{month}'}/排班表_{'{date}'}.xlsx</div>
              <div className="ddi-code-block ddi-mono">/reports/attendance/{'{year}'}/考勤_{'{date}'}.xlsx</div>
            </div>
            <div style={{ marginTop: 10 }}>
              <Tag>{'{year}'}</Tag>
              <Tag>{'{month}'}</Tag>
              <Tag>{'{day}'}</Tag>
              <Tag>{'{date}'}</Tag>
              <Tag>{'{datetime}'}</Tag>
              <Tag>{'{api_name}'}</Tag>
            </div>
          </Card>
        </Col>
      </Row>

      <Alert
        showIcon
        type="info"
        style={{ marginTop: 12 }}
        message="说明"
        description="当前为前端实现阶段，上传策略和 FTP 测试按钮先提供页面交互，后续再接后端执行逻辑。"
      />
    </div>
  )
}
