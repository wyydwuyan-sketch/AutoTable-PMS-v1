import { Alert, Card, Col, Empty, List, Row, Spin, Statistic, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useEffect, useMemo } from 'react'
import { useIntegrationsStore } from '../integrationStore'
import type { ExecutionLog, ExecutionStatus } from '../types'

const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

const statusToClassName = (status: ExecutionStatus) => {
  if (status === 'success') return 'ddi-status-pill is-success'
  if (status === 'failed') return 'ddi-status-pill is-failed'
  return 'ddi-status-pill is-running'
}

const statusToText = (status: ExecutionStatus) => {
  if (status === 'success') return '成功'
  if (status === 'failed') return '失败'
  return '执行中'
}

export default function IntegrationDashboard() {
  const bootstrap = useIntegrationsStore((state) => state.bootstrap)
  const isBootstrapping = useIntegrationsStore((state) => state.isBootstrapping)
  const stats = useIntegrationsStore((state) => state.stats)
  const connectors = useIntegrationsStore((state) => state.connectors)
  const logs = useIntegrationsStore((state) => state.logs)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  const recentLogs = useMemo(() => logs.slice(0, 6), [logs])
  const failedLogs = useMemo(() => logs.filter((item) => item.status === 'failed').slice(0, 4), [logs])
  const upcomingConnectors = useMemo(
    () =>
      connectors
        .filter((item) => item.isEnabled && item.schedule.isEnabled && item.schedule.nextRunAt)
        .sort((a, b) => new Date(a.schedule.nextRunAt ?? 0).getTime() - new Date(b.schedule.nextRunAt ?? 0).getTime())
        .slice(0, 5),
    [connectors],
  )

  const columns: ColumnsType<ExecutionLog> = [
    {
      title: '接口名称',
      dataIndex: 'connectorName',
      key: 'connectorName',
      ellipsis: true,
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
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: ExecutionStatus) => <span className={statusToClassName(value)}>{statusToText(value)}</span>,
    },
    {
      title: '写入行数',
      dataIndex: 'rowsWritten',
      key: 'rowsWritten',
      width: 120,
      render: (value: number) => <span className="ddi-mono">{value}</span>,
    },
  ]

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">工作台</h1>
          <div className="ddi-page-subtitle">DDI 接口运行概览与异常追踪</div>
        </div>
      </div>

      {isBootstrapping ? (
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 260 }}>
          <Spin size="large" />
        </div>
      ) : null}

      {!isBootstrapping ? (
        <>
          <div className="ddi-grid-4" style={{ marginBottom: 12 }}>
            <Card variant="borderless">
              <Statistic title="接口总数" value={stats.totalConnectors} />
            </Card>
            <Card variant="borderless">
              <Statistic title="启用接口" value={stats.enabledConnectors} valueStyle={{ color: 'var(--primary)' }} />
            </Card>
            <Card variant="borderless">
              <Statistic title="今日执行" value={stats.runsToday} />
            </Card>
            <Card variant="borderless">
              <Statistic title="成功率" suffix="%" value={stats.successRate} valueStyle={{ color: '#14b8a6' }} />
            </Card>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={24} xl={15}>
              <Card title="最近执行记录" styles={{ body: { padding: 0 } }}>
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={recentLogs}
                  pagination={false}
                  size="middle"
                  locale={{ emptyText: <Empty description="暂无执行记录" /> }}
                />
              </Card>
            </Col>

            <Col xs={24} xl={9}>
              <Card title="即将执行">
                {upcomingConnectors.length === 0 ? (
                  <Empty description="暂无已启用调度任务" />
                ) : (
                  <List
                    dataSource={upcomingConnectors}
                    renderItem={(item) => (
                      <List.Item>
                        <List.Item.Meta
                          title={item.name}
                          description={
                            <div style={{ display: 'grid', gap: 4 }}>
                              <span className="ddi-mono">Cron: {item.schedule.cronExpr}</span>
                              <span>下次执行：{formatDateTime(item.schedule.nextRunAt)}</span>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <Card title="待处理异常" style={{ marginTop: 12 }}>
            {failedLogs.length === 0 ? (
              <Empty description="暂无失败记录" />
            ) : (
              <List
                dataSource={failedLogs}
                renderItem={(item) => (
                  <List.Item>
                    <Alert
                      type="error"
                      showIcon
                      style={{ width: '100%' }}
                      message={`${item.connectorName} 执行失败`}
                      description={`${formatDateTime(item.startedAt)} · ${item.errorMsg ?? '未知错误'}`}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </>
      ) : null}
    </div>
  )
}
