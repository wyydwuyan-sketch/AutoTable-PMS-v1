import { Pagination } from 'antd'
import zhPaginationLocale from '@rc-component/pagination/es/locale/zh_CN'
import './CustomPagination.css'

interface CustomPaginationProps {
    current: number
    total: number
    pageSize: number
    pageSizeOptions?: number[]
    onChange: (page: number) => void
    onPageSizeChange?: (size: number) => void
}

export function CustomPagination({
    current,
    total,
    pageSize,
    pageSizeOptions = [25, 50, 100],
    onChange,
    onPageSizeChange,
}: CustomPaginationProps) {
    return (
        <div className="custom-pagination">
            <Pagination
                current={current}
                total={total}
                pageSize={pageSize}
                pageSizeOptions={pageSizeOptions}
                locale={zhPaginationLocale}
                showQuickJumper
                showSizeChanger={!!onPageSizeChange}
                showTotal={(count) => `共 ${count} 条`}
                onChange={(page, nextPageSize) => {
                    if (nextPageSize !== pageSize && onPageSizeChange) {
                        return
                    }
                    onChange(page)
                }}
                onShowSizeChange={(_, size) => onPageSizeChange?.(size)}
            />
        </div>
    )
}
