import { useMemo, useState } from 'react'
import './CustomPagination.css'

interface CustomPaginationProps {
    current: number
    total: number
    pageSize: number
    pageSizeOptions?: number[]
    selectedCount?: number
    onChange: (page: number) => void
    onPageSizeChange?: (size: number) => void
}

function buildPageNumbers(current: number, totalPages: number): (number | 'ellipsis')[] {
    if (totalPages <= 7) {
        return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | 'ellipsis')[] = [1]
    if (current > 3) pages.push('ellipsis')
    const start = Math.max(2, current - 1)
    const end = Math.min(totalPages - 1, current + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (current < totalPages - 2) pages.push('ellipsis')
    pages.push(totalPages)
    return pages
}

export function CustomPagination({
    current,
    total,
    pageSize,
    pageSizeOptions = [25, 50, 100],
    selectedCount = 0,
    onChange,
    onPageSizeChange,
}: CustomPaginationProps) {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const pages = useMemo(() => buildPageNumbers(current, totalPages), [current, totalPages])
    const [jumpValue, setJumpValue] = useState('')

    const handleJump = () => {
        const page = parseInt(jumpValue, 10)
        if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
            onChange(page)
        }
        setJumpValue('')
    }

    return (
        <div className="custom-pagination">
            <div className="custom-pagination-left">
                {selectedCount > 0 ? (
                    <span className="custom-pagination-meta">已选 {selectedCount} 条 · </span>
                ) : null}
                <span className="custom-pagination-meta">共 {total.toLocaleString()} 条</span>
                {onPageSizeChange ? (
                    <select
                        className="custom-pagination-size"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size}>{size} 条/页</option>
                        ))}
                    </select>
                ) : null}
            </div>
            <div className="custom-pagination-right">
                <div className="custom-pagination-pages">
                    <button
                        className="custom-pagination-btn"
                        disabled={current <= 1}
                        onClick={() => onChange(current - 1)}
                        aria-label="上一页"
                    >
                        ‹
                    </button>
                    {pages.map((page, index) =>
                        page === 'ellipsis' ? (
                            <span key={`ellipsis-${index}`} className="custom-pagination-ellipsis">…</span>
                        ) : (
                            <button
                                key={page}
                                className={`custom-pagination-btn${page === current ? ' custom-pagination-btn--active' : ''}`}
                                onClick={() => onChange(page)}
                            >
                                {page}
                            </button>
                        ),
                    )}
                    <button
                        className="custom-pagination-btn"
                        disabled={current >= totalPages}
                        onClick={() => onChange(current + 1)}
                        aria-label="下一页"
                    >
                        ›
                    </button>
                </div>
                <div className="custom-pagination-jump-wrap">
                    <span className="custom-pagination-meta">跳至</span>
                    <input
                        className="custom-pagination-jump"
                        type="number"
                        min={1}
                        max={totalPages}
                        value={jumpValue}
                        placeholder={String(current)}
                        onChange={(e) => setJumpValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleJump()
                        }}
                        onBlur={handleJump}
                    />
                </div>
            </div>
        </div>
    )
}
