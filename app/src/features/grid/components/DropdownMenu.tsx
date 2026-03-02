import type { ReactNode } from 'react'
import { Dropdown } from 'antd'
import type { MenuProps } from 'antd'
import './DropdownMenu.css'

export interface DropdownMenuItem {
    key?: string
    label?: ReactNode
    disabled?: boolean
    danger?: boolean
    type?: 'divider'
}

interface DropdownMenuProps {
    items: DropdownMenuItem[]
    onClick?: (info: { key: string }) => void
    onSelect?: (key: string) => void
    trigger?: ReactNode
    children?: ReactNode
}

export function DropdownMenu({ items, onClick, onSelect, trigger, children }: DropdownMenuProps) {
    const menuItems: MenuProps['items'] = items.map((item, index) => {
        if (item.type === 'divider') {
            return { type: 'divider' }
        }
        return {
            key: item.key ?? `item-${index}`,
            label: item.label,
            disabled: item.disabled,
            danger: item.danger,
        }
    })

    const content = trigger ?? children
    if (!content) return null

    return (
        <Dropdown
            trigger={['click']}
            menu={{
                items: menuItems,
                onClick: (info) => {
                    info.domEvent.stopPropagation()
                    const key = String(info.key)
                    onClick?.({ key })
                    onSelect?.(key)
                },
            }}
        >
            <span
                style={{ display: 'inline-flex' }}
                onClick={(event) => event.stopPropagation()}
            >
                {content}
            </span>
        </Dropdown>
    )
}
