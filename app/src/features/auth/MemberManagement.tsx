import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, App as AntdApp, Button, Card, Checkbox, Col, Flex, Form, Input, Modal, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { authApi } from './api'
import { useAuthStore } from './authStore'
import type { TenantMember, TenantRole } from './types'
import { gridApiClient } from '../grid/api'
import type { TableButtonPermissions, ViewPermissionItem, View } from '../grid/types/grid'
import { getApiErrorMessage } from '../../utils/apiError'

type MemberViewPermissionRow = {
  viewId: string
  viewName: string
  canRead: boolean
  canWrite: boolean
}

type MemberViewPermissionSnapshot = {
  viewId: string
  items: ViewPermissionItem[]
}

const defaultTableButtonPermissions: TableButtonPermissions = {
  canCreateRecord: true,
  canDeleteRecord: true,
  canImportRecords: true,
  canExportRecords: true,
  canManageFilters: true,
  canManageSorts: true,
}

const tableButtonPermissionItems: Array<{ key: keyof TableButtonPermissions; label: string }> = [
  { key: 'canCreateRecord', label: '新增记录' },
  { key: 'canDeleteRecord', label: '删除记录' },
  { key: 'canImportRecords', label: '导入记录' },
  { key: 'canExportRecords', label: '导出数据' },
  { key: 'canManageFilters', label: '筛选配置' },
  { key: 'canManageSorts', label: '排序配置' },
]

export function MemberManagement() {
  const { message, modal } = AntdApp.useApp()
  const { tableId = 'tbl_1' } = useParams()
  const accessToken = useAuthStore((state) => state.accessToken)
  const role = useAuthStore((state) => state.role)
  const currentUser = useAuthStore((state) => state.user)
  const currentTenant = useAuthStore((state) => state.currentTenant)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [members, setMembers] = useState<TenantMember[]>([])
  const [roles, setRoles] = useState<TenantRole[]>([])
  const [views, setViews] = useState<View[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [createForm] = Form.useForm<{
    username: string
    account: string
    password?: string
    email?: string
    mobile?: string
    roleKey: string
  }>()

  const [editOpen, setEditOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editPermissionLoading, setEditPermissionLoading] = useState(false)
  const [editTarget, setEditTarget] = useState<TenantMember | null>(null)
  const [editForm] = Form.useForm<{ roleKey: string }>()
  const [editViewRows, setEditViewRows] = useState<MemberViewPermissionRow[]>([])
  const [editSnapshots, setEditSnapshots] = useState<MemberViewPermissionSnapshot[]>([])
  const [editTableButtons, setEditTableButtons] = useState<TableButtonPermissions>(defaultTableButtonPermissions)

  const canManage = role === 'owner'

  const loadData = useCallback(async () => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    try {
      const [nextMembers, nextRoles, nextViews] = await Promise.all([
        authApi.listMembers(accessToken),
        authApi.listRoles(accessToken),
        gridApiClient.getViews(tableId),
      ])
      setMembers(nextMembers)
      setRoles(nextRoles)
      setViews(nextViews)
    } catch (err) {
      setError(getApiErrorMessage(err, '加载成员管理数据失败'))
    } finally {
      setLoading(false)
    }
  }, [accessToken, tableId])

  useEffect(() => {
    if (!canManage) {
      setError('当前账号无成员管理权限。')
      return
    }
    void loadData()
  }, [canManage, loadData])

  const roleOptions = useMemo(
    () => roles.map((item) => ({ value: item.key, label: item.name })),
    [roles],
  )
  const ownerCount = useMemo(() => members.filter((item) => item.role === 'owner').length, [members])
  const editableMemberCount = useMemo(() => members.filter((item) => item.role !== 'owner').length, [members])

  const openEditMember = useCallback(async (member: TenantMember) => {
    setEditTarget(member)
    editForm.setFieldsValue({ roleKey: member.roleKey })
    setEditOpen(true)
    setEditSnapshots([])
    setEditTableButtons(defaultTableButtonPermissions)

    if (member.role === 'owner') {
      setEditViewRows(
        views.map((item) => ({
          viewId: item.id,
          viewName: item.name,
          canRead: true,
          canWrite: true,
        })),
      )
      setEditTableButtons(defaultTableButtonPermissions)
      return
    }

    setEditPermissionLoading(true)
    try {
      const [permissionGroups, tableButtonPermissions] = await Promise.all([
        Promise.all(
          views.map(async (view) => ({
            viewId: view.id,
            viewName: view.name,
            items: await gridApiClient.getViewPermissions(view.id),
          })),
        ),
        gridApiClient.getTableButtonPermissions(tableId),
      ])
      setEditSnapshots(permissionGroups.map((item) => ({ viewId: item.viewId, items: item.items })))
      setEditViewRows(
        permissionGroups.map((item) => {
          const hit = item.items.find((permission) => permission.userId === member.userId)
          return {
            viewId: item.viewId,
            viewName: item.viewName,
            canRead: hit?.canRead ?? false,
            canWrite: hit?.canWrite ?? false,
          }
        }),
      )
      const hit = tableButtonPermissions.find((item) => item.userId === member.userId)
      setEditTableButtons(hit?.buttons ?? defaultTableButtonPermissions)
    } catch (err) {
      message.error(getApiErrorMessage(err, '加载视图权限失败'))
      setEditViewRows([])
      setEditTableButtons(defaultTableButtonPermissions)
    } finally {
      setEditPermissionLoading(false)
    }
  }, [editForm, message, tableId, views])

  const saveEditMember = async () => {
    if (!accessToken || !editTarget) return
    const values = await editForm.validateFields()
    setEditLoading(true)
    try {
      if (editTarget.role !== 'owner' && values.roleKey !== editTarget.roleKey) {
        await authApi.updateMemberRole(accessToken, editTarget.userId, values.roleKey)
      }

      if (editTarget.role !== 'owner') {
        await Promise.all(
          editSnapshots.map(async (snapshot) => {
            const nextPermission = editViewRows.find((item) => item.viewId === snapshot.viewId)
            if (!nextPermission) return
            const nextItems = snapshot.items.map((item) =>
              item.userId === editTarget.userId
                ? {
                    userId: item.userId,
                    canRead: nextPermission.canRead,
                    canWrite: nextPermission.canWrite,
                  }
                : {
                    userId: item.userId,
                    canRead: item.canRead,
                    canWrite: item.canWrite,
                  },
            )
            const exists = nextItems.some((item) => item.userId === editTarget.userId)
            if (!exists) {
              nextItems.push({
                userId: editTarget.userId,
                canRead: nextPermission.canRead,
                canWrite: nextPermission.canWrite,
              })
            }
            await gridApiClient.updateViewPermissions(snapshot.viewId, nextItems)
          }),
        )
        await gridApiClient.updateTableButtonPermissions(tableId, [
          { userId: editTarget.userId, buttons: editTableButtons },
        ])
      }

      setEditOpen(false)
      setEditTarget(null)
      message.success('成员信息已更新。')
      await loadData()
    } finally {
      setEditLoading(false)
    }
  }

  const memberColumns: TableColumnsType<TenantMember> = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username', key: 'username' },
      {
        title: '职级',
        key: 'roleName',
        width: 240,
        render: (_, row) => (row.role === 'owner' ? <Tag color="gold">Owner</Tag> : <Tag>{row.roleName}</Tag>),
      },
      {
        title: '操作',
        key: 'actions',
        width: 220,
        render: (_, row) => (
          <Space>
            <Button size="small" onClick={() => void openEditMember(row)}>
              编辑
            </Button>
            <Button
              danger
              size="small"
              disabled={row.userId === currentUser?.id || row.role === 'owner'}
              onClick={() => {
                modal.confirm({
                  title: '确认移除该成员？',
                  content: `将从当前租户移除用户 ${row.username}`,
                  okText: '确认移除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: async () => {
                    if (!accessToken) return
                    await authApi.removeMember(accessToken, row.userId)
                    await loadData()
                  },
                })
              }}
            >
              移除
            </Button>
          </Space>
        ),
      },
    ],
    [accessToken, currentUser?.id, loadData, modal, openEditMember],
  )

  const editViewColumns: TableColumnsType<MemberViewPermissionRow> = useMemo(
    () => [
      {
        title: '视图',
        dataIndex: 'viewName',
        key: 'viewName',
      },
      {
        title: '可读',
        key: 'canRead',
        width: 120,
        render: (_, row) => (
          <Checkbox
            checked={row.canRead}
            disabled={editTarget?.role === 'owner'}
            onChange={(e) => {
              const next = e.target.checked
              setEditViewRows((prev) =>
                prev.map((item) =>
                  item.viewId === row.viewId
                    ? { ...item, canRead: next || item.canWrite }
                    : item,
                ),
              )
            }}
          />
        ),
      },
      {
        title: '可写',
        key: 'canWrite',
        width: 120,
        render: (_, row) => (
          <Checkbox
            checked={row.canWrite}
            disabled={editTarget?.role === 'owner'}
            onChange={(e) => {
              const next = e.target.checked
              setEditViewRows((prev) =>
                prev.map((item) =>
                  item.viewId === row.viewId
                    ? { ...item, canWrite: next, canRead: next ? true : item.canRead }
                    : item,
                ),
              )
            }}
          />
        ),
      },
    ],
    [editTarget?.role],
  )

  return (
    <div className="grid-root" style={{ padding: 24, overflowY: 'auto' }}>
      <Card
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 18 } }}
      >
        <Flex justify="space-between" align="flex-start" gap={12} wrap>
          <div>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
              成员管理
            </Typography.Title>
            <Typography.Text type="secondary">
              当前租户：{currentTenant?.name ?? '-'}。成员配置统一在本页进行。
            </Typography.Text>
          </div>
          <Space wrap>
            <Button
              type="primary"
              onClick={() => {
                createForm.resetFields()
                createForm.setFieldValue('roleKey', 'member')
                setCreateOpen(true)
              }}
            >
              新增成员
            </Button>
            <Button onClick={() => void loadData()} loading={loading}>
              刷新
            </Button>
          </Space>
        </Flex>

        {error ? <Alert type="error" showIcon message={error} style={{ marginTop: 14 }} /> : null}

        <Row gutter={[12, 12]} style={{ marginTop: 14 }}>
          <Col xs={24} sm={12} lg={8}>
            <Card size="small" variant="borderless" styles={{ body: { padding: 14 } }}>
              <Statistic title="成员总数" value={members.length} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card size="small" variant="borderless" styles={{ body: { padding: 14 } }}>
              <Statistic title="Owner 数量" value={ownerCount} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card size="small" variant="borderless" styles={{ body: { padding: 14 } }}>
              <Statistic title="可编辑成员" value={editableMemberCount} />
            </Card>
          </Col>
        </Row>
      </Card>

      <Card
        title="成员列表"
        extra={<Typography.Text type="secondary">共 {members.length} 位成员</Typography.Text>}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Table<TenantMember>
          rowKey="userId"
          loading={loading}
          columns={memberColumns}
          dataSource={members}
          size="middle"
          scroll={{ x: 720 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 位成员`,
          }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新增成员"
        onCancel={() => setCreateOpen(false)}
        onOk={() => {
          void createForm.validateFields().then(async (values) => {
            if (!accessToken) return
            setCreateLoading(true)
            try {
              const created = await authApi.createMember(accessToken, {
                username: values.username,
                account: values.account,
                password: values.password,
                email: values.email,
                mobile: values.mobile,
                roleKey: values.roleKey,
              })
              setCreateOpen(false)
              await loadData()
              if (created.temporaryPassword) {
                modal.info({
                  title: '成员创建成功',
                  content: (
                    <div>
                      <Typography.Paragraph style={{ marginBottom: 8 }}>
                        已生成一次性初始密码，请安全转交并提醒首次登录立即修改：
                      </Typography.Paragraph>
                      <Typography.Text copyable code>
                        {created.temporaryPassword}
                      </Typography.Text>
                    </div>
                  ),
                  okText: '我已保存',
                })
              } else {
                message.success('成员已创建。')
              }
            } finally {
              setCreateLoading(false)
            }
          })
        }}
        okText="确认新增"
        cancelText="取消"
        confirmLoading={createLoading}
        destroyOnHidden={false}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Form layout="vertical" form={createForm}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="例如：张三" />
          </Form.Item>
          <Form.Item name="account" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
            <Input placeholder="例如：zhangsan" />
          </Form.Item>
          <Form.Item name="password" label="初始密码（可选）" rules={[{ min: 8, message: '至少 8 位' }]}>
            <Input.Password placeholder="留空将自动生成一次性随机密码" />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name="email" label="邮箱">
                <Input placeholder="例如：zhangsan@company.com" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="mobile" label="手机号">
                <Input placeholder="例如：13800000000" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="roleKey" label="职级" rules={[{ required: true, message: '请选择职级' }]}>
            <Select options={roleOptions} />
          </Form.Item>
          <Alert type="info" showIcon message="建议使用系统随机密码，并要求成员首次登录后立即修改。" />
        </Form>
      </Modal>

      <Modal
        open={editOpen}
        title={`编辑成员：${editTarget?.username ?? ''}`}
        onCancel={() => setEditOpen(false)}
        onOk={() => {
          void saveEditMember()
        }}
        okText="保存"
        cancelText="取消"
        confirmLoading={editLoading}
        width={900}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingTop: 8 } }}
      >
        {editTarget?.role === 'owner' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Owner 的职级与视图权限固定为最高权限，不可修改。"
          />
        ) : null}
        <Form layout="vertical" form={editForm}>
          <Form.Item name="roleKey" label="职级" rules={[{ required: true, message: '请选择职级' }]}>
            <Select options={roleOptions} disabled={editTarget?.role === 'owner'} />
          </Form.Item>
        </Form>
        <Card size="small" title="视图权限" styles={{ body: { paddingTop: 8 } }}>
          <Table<MemberViewPermissionRow>
            rowKey="viewId"
            loading={editPermissionLoading}
            columns={editViewColumns}
            dataSource={editViewRows}
            pagination={false}
            size="small"
          />
        </Card>
        <Card size="small" title="表格按钮权限" style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))' }}>
            {tableButtonPermissionItems.map((item) => (
              <Checkbox
                key={item.key}
                checked={editTableButtons[item.key]}
                disabled={editTarget?.role === 'owner'}
                onChange={(event) =>
                  setEditTableButtons((prev) => ({
                    ...prev,
                    [item.key]: event.target.checked,
                  }))
                }
              >
                {item.label}
              </Checkbox>
            ))}
          </div>
        </Card>
      </Modal>
    </div>
  )
}
