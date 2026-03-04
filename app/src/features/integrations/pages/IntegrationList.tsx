import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Input, Space, Switch, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIntegrationsStore } from '../integrationStore'
import type { ApiConnector, ExecutionStatus } from '../types'

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const statusToTag = (status: ExecutionStatus | null) => {
  if (status === 'success') return <Tag color="success">最近成功</Tag>
  if (status === 'failed') return <Tag color="error">最近失败</Tag>
  if (status === 'running') return <Tag color="processing">执行中</Tag>
  return <Tag>未执行</Tag>
}

export default function IntegrationList() {
  const navigate = useNavigate()
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const connectors = useIntegrationsStore((state) => state.connectors)
  const actionLoadingById = useIntegrationsStore((state) => state.actionLoadingById)
  const runConnector = useIntegrationsStore((state) => state.runConnector)
  const toggleConnectorEnabled = useIntegrationsStore((state) => state.toggleConnectorEnabled)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const dataSource = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return connectors
    return connectors.filter((item) =>
      [item.name, item.url, item.tableName].some((field) => field.toLowerCase().includes(normalized)),
    )
  }, [connectors, keyword])

  const columns: ColumnsType<ApiConnector> = [
    {
      title: '接口名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string, record) => (
        <div style={{ display: 'grid', gap: 4 }}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{record.description ?? '未填写描述'}</Typography.Text>
        </div>
      ),
    },
    {
      title: '请求',
      key: 'request',
      width: 260,
      render: (_, record) => (
        <div style={{ display: 'grid', gap: 4 }}>
          <Tag color={record.method === 'GET' ? 'processing' : 'purple'}>{record.method}</Tag>
          <Typography.Text className="ddi-mono" ellipsis={{ tooltip: record.url }} style={{ maxWidth: 220 }}>
            {record.url}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '目标表',
      dataIndex: 'tableName',
      key: 'tableName',
      width: 140,
    },
    {
      title: '调度',
      key: 'schedule',
      width: 200,
      render: (_, record) => (
        <div style={{ display: 'grid', gap: 4 }}>
          <Typography.Text className="ddi-mono">{record.schedule.cronExpr}</Typography.Text>
          <Typography.Text type="secondary">{record.schedule.isEnabled ? '已启用' : '未启用'}</Typography.Text>
        </div>
      ),
    },
    {
      title: '最近执行',
      key: 'lastRun',
      width: 180,
      render: (_, record) => (
        <div style={{ display: 'grid', gap: 4 }}>
          {statusToTag(record.lastStatus)}
          <Typography.Text type="secondary">{formatDateTime(record.lastRunAt)}</Typography.Text>
        </div>
      ),
    },
    {
      title: '启用',
      key: 'enabled',
      width: 96,
      align: 'center',
      render: (_, record) => (
        <Switch
          checked={record.isEnabled}
          onChange={(checked) => {
            toggleConnectorEnabled(record.id, checked)
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={<PlayCircleOutlined />}
            loading={Boolean(actionLoadingById[record.id])}
            onClick={() => {
              void runConnector(record.id).then(() => {
                message.success('已触发执行。')
              })
            }}
          >
            手动执行
          </Button>
          <Button size="small" onClick={() => navigate('/integrations/schedule')}>
            调度
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">接口列表</h1>
          <div className="ddi-page-subtitle">查看和管理所有 DDI 接口配置</div>
        </div>
        <Space>
          <Input.Search
            placeholder="按名称 / URL / 表名搜索"
            allowClear
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 280 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/integrations/list/create')}>
            新建接口
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={dataSource}
        pagination={{ pageSize: 8, showSizeChanger: false }}
        scroll={{ x: 1320 }}
      />
    </div>
  )
}
