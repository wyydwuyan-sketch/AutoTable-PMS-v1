import type { ReactNode } from 'react'
import { Drawer } from 'antd'
import './CustomDrawer.css'

interface CustomDrawerProps {
    open: boolean
    title?: ReactNode
    onClose: () => void
    width?: number
    footer?: ReactNode
    children?: ReactNode
}

export function CustomDrawer({
    open,
    title,
    onClose,
    width = 560,
    footer,
    children,
}: CustomDrawerProps) {
    return (
        <Drawer
            open={open}
            title={title}
            onClose={onClose}
            width={width}
            footer={footer}
            destroyOnHidden={false}
            mask={{ closable: true }}
            keyboard
        >
            {children}
        </Drawer>
    )
}
