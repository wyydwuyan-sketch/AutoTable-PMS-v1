import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'

interface FileRecordItem {
  id: string
  fileName: string
  connectorName: string
  size: string
  uploadedAt: string
  status: 'uploaded' | 'failed' | 'pending'
}

const MOCK_FILES: FileRecordItem[] = [
  {
    id: 'file_1',
    fileName: '排班表_2026-03-04.xlsx',
    connectorName: '员工排班同步',
    size: '1.8 MB',
    uploadedAt: '2026-03-04T08:03:02',
    status: 'uploaded',
  },
  {
    id: 'file_2',
    fileName: '工单汇总_2026-03-04.csv',
    connectorName: '工单状态回写',
    size: '856 KB',
    uploadedAt: '2026-03-04T07:35:11',
    status: 'failed',
  },
  {
    id: 'file_3',
    fileName: '人员主数据_2026-03-03.xlsx',
    connectorName: '人员主数据同步',
    size: '2.4 MB',
    uploadedAt: '2026-03-03T06:01:45',
    status: 'uploaded',
  },
]

const formatDateTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false })

const statusTag = (status: FileRecordItem['status']) => {
  if (status === 'uploaded') return <Tag color="success">上传成功</Tag>
  if (status === 'failed') return <Tag color="error">上传失败</Tag>
  return <Tag color="processing">待上传</Tag>
}

export default function FileRecords() {
  const columns: ColumnsType<FileRecordItem> = [
    { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
    { title: '来源接口', dataIndex: 'connectorName', key: 'connectorName', width: 170 },
    { title: '大小', dataIndex: 'size', key: 'size', width: 120 },
    {
      title: '上传时间',
      dataIndex: 'uploadedAt',
      key: 'uploadedAt',
      width: 190,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: FileRecordItem['status']) => statusTag(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: () => <Button size="small">查看详情</Button>,
    },
  ]

  return (
    <div className="ddi-page">
      <div className="ddi-page-head">
        <div>
          <h1 className="ddi-page-title">文件记录</h1>
          <div className="ddi-page-subtitle">查看接口输出文件与上传状态</div>
        </div>
      </div>
      <Table rowKey="id" columns={columns} dataSource={MOCK_FILES} pagination={{ pageSize: 8, showSizeChanger: false }} />
    </div>
  )
}
