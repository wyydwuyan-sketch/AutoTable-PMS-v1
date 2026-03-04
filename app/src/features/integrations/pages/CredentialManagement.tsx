import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, Modal, Popconfirm, Select, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useState } from 'react'
import { useIntegrationsStore } from '../integrationStore'
import type { AuthType, Credential } from '../types'

interface CredentialFormValues {
  name: string
  authType: AuthType
  secret: string
}

const AUTH_TYPE_OPTIONS: Array<{ label: string; value: AuthType }> = [
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'API Key', value: 'api_key' },
]

const formatDateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

export default function CredentialManagement() {
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const credentials = useIntegrationsStore((state) => state.credentials)
  const addCredential = useIntegrationsStore((state) => state.addCredential)
  const removeCredential = useIntegrationsStore((state) => state.removeCredential)
  const [form] = Form.useForm<CredentialFormValues>()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const columns: ColumnsType<Credential> = [
    {
      title: '凭据名称',
      dataIndex: 'name',
      key: 'name',
      width: 240,
    },
    {
      title: '认证类型',
      dataIndex: 'authType',
      key: 'authType',
      width: 120,
      render: (value: AuthType) => <Tag>{value}</Tag>,
    },
    {
      title: '密钥摘要',
      dataIndex: 'maskedSecret',
      key: 'maskedSecret',
      render: (value: string) => <span className="ddi-mono">{value}</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Popconfirm
          title="确认删除该凭据？"
          description="删除后，已引用该凭据的接口将需要重新选择认证。"
          okText="删除"
          okButtonProps={{ danger: true }}
          cancelText="取消"
          onConfirm={() => {
            void removeCredential(record.id).then(() => message.success('凭据已删除。'))
          }}
        >
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      await addCredential(values)
      message.success('凭据创建成功。')
      form.resetFields()
      setOpen(false)
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
          <h1 className="ddi-page-title">凭据管理</h1>
          <div className="ddi-page-subtitle">统一管理接口认证凭据（前端仅展示脱敏值）</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          新增凭据
        </Button>
      </div>

      <Table<Credential>
        rowKey="id"
        columns={columns}
        dataSource={credentials}
        pagination={{ pageSize: 8, showSizeChanger: false }}
      />

      <Modal
        open={open}
        title="新增凭据"
        okText="保存"
        cancelText="取消"
        onCancel={() => {
          setOpen(false)
          form.resetFields()
        }}
        onOk={() => void handleCreate()}
        confirmLoading={submitting}
      >
        <Form<CredentialFormValues> form={form} layout="vertical" initialValues={{ authType: 'bearer' }}>
          <Form.Item label="凭据名称" name="name" rules={[{ required: true, message: '请输入凭据名称' }]}>
            <Input placeholder="例如：HR Bearer Token" />
          </Form.Item>
          <Form.Item label="认证类型" name="authType" rules={[{ required: true, message: '请选择认证类型' }]}>
            <Select options={AUTH_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item label="密钥内容" name="secret" rules={[{ required: true, message: '请输入密钥内容' }]}>
            <Input.Password placeholder="输入后将仅保存脱敏显示" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
