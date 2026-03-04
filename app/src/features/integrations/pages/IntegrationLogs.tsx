import { Drawer, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo, useState } from 'react'
import { useIntegrationsStore } from '../integrationStore'
import type { ExecutionLog, ExecutionStatus } from '../types'

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const statusTag = (status: ExecutionStatus) => {
  if (status === 'success') return <Tag color="success">成功</Tag>
  if (status === 'failed') return <Tag color="error">失败</Tag>
  return <Tag color="processing">执行中</Tag>
}

export default function IntegrationLogs() {
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const connectors = useIntegrationsStore((state) => state.connectors)
  const logs = useIntegrationsStore((state) => state.logs)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | undefined>(undefined)
  const [selectedStatus, setSelectedStatus] = useState<ExecutionStatus | undefined>(undefined)
  const [keyword, setKeyword] = useState('')
  const [activeLog, setActiveLog] = useState<ExecutionLog | null>(null)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const filteredLogs = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return logs.filter((item) => {
      if (selectedConnectorId && item.connectorId !== selectedConnectorId) return false
      if (selectedStatus && item.status !== selectedStatus) return false
      if (!normalized) return true
      return [item.connectorName, item.errorMsg ?? '', item.rawLog].some((value) =>
        value.toLowerCase().includes(normalized),
      )
    })
  }, [keyword, logs, selectedConnectorId, selectedStatus])

  const columns: ColumnsType<ExecutionLog> = [
    {
      title: '接口名称',
      dataIndex: 'connectorName',
      key: 'connectorName',
      width: 220,
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '结束时间',
      dataIndex: 'finishedAt',
      key: 'finishedAt',
      width: 180,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: ExecutionStatus) => statusTag(value),
    },
    {
      title: '写入行数',
      dataIndex: 'rowsWritten',
      key: 'rowsWritten',
      width: 120,
      render: (value: number) => <Typography.Text className="ddi-mono">{value}</Typography.Text>,
    },
    {
      title: '错误信息',
      dataIndex: 'errorMsg',
      key: 'errorMsg',
      ellipsis: true,
      render: (value: string | null) => value ?? '-',
    },
  ]

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">执行日志</h1>
          <div className="ddi-page-subtitle">查看运行轨迹、失败原因与执行详情</div>
        </div>
      </div>

      <Space wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          placeholder="按接口筛选"
          style={{ width: 220 }}
          options={connectors.map((item) => ({ label: item.name, value: item.id }))}
          value={selectedConnectorId}
          onChange={(value) => setSelectedConnectorId(value)}
        />
        <Select
          allowClear
          placeholder="按状态筛选"
          style={{ width: 160 }}
          options={[
            { label: '成功', value: 'success' },
            { label: '失败', value: 'failed' },
            { label: '执行中', value: 'running' },
          ]}
          value={selectedStatus}
          onChange={(value) => setSelectedStatus(value)}
        />
        <Input.Search
          allowClear
          placeholder="搜索接口名 / 错误信息 / 日志内容"
          style={{ width: 320 }}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </Space>

      <Table<ExecutionLog>
        rowKey="id"
        columns={columns}
        dataSource={filteredLogs}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: <Empty description="暂无日志记录" /> }}
        onRow={(record) => ({
          onClick: () => setActiveLog(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        open={Boolean(activeLog)}
        title={activeLog ? `${activeLog.connectorName} · 执行详情` : '执行详情'}
        width={680}
        onClose={() => setActiveLog(null)}
      >
        {activeLog ? (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="ddi-card">
              <div className="ddi-card-title">执行信息</div>
              <div style={{ display: 'grid', gap: 4 }}>
                <div>开始时间：{formatDateTime(activeLog.startedAt)}</div>
                <div>结束时间：{formatDateTime(activeLog.finishedAt)}</div>
                <div>状态：{statusTag(activeLog.status)}</div>
                <div>写入行数：{activeLog.rowsWritten}</div>
                <div>错误信息：{activeLog.errorMsg ?? '-'}</div>
              </div>
            </div>
            <div className="ddi-card">
              <div className="ddi-card-title">原始日志</div>
              <div className="ddi-code-block ddi-mono">{activeLog.rawLog}</div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
