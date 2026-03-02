import type { ReactNode } from 'react'
import { Modal } from 'antd'
import './CustomModal.css'

interface CustomModalProps {
    open: boolean
    title?: ReactNode
    onCancel: () => void
    onOk?: () => void
    footer?: ReactNode | null
    okText?: string
    cancelText?: string
    width?: number
    confirmLoading?: boolean
    cancelDisabled?: boolean
    children?: ReactNode
}

export function CustomModal({
    open,
    title,
    onCancel,
    onOk,
    footer,
    okText = '确定',
    cancelText = '取消',
    width = 520,
    confirmLoading = false,
    cancelDisabled = false,
    children,
}: CustomModalProps) {
    const resolvedFooter =
        footer !== undefined
            ? footer
            : onOk
                ? undefined
                : null

    return (
        <Modal
            open={open}
            title={title}
            onCancel={onCancel}
            onOk={onOk}
            width={width}
            okText={okText}
            cancelText={cancelText}
            confirmLoading={confirmLoading}
            footer={resolvedFooter}
            keyboard={!confirmLoading}
            maskClosable={!confirmLoading}
            closable={!confirmLoading}
            cancelButtonProps={{ disabled: confirmLoading || cancelDisabled }}
            destroyOnClose={false}
        >
            {children}
        </Modal>
    )
}
