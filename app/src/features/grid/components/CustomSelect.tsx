import type { ReactNode } from 'react'
import { Select } from 'antd'
import './CustomModal.css'

export interface SelectOption {
    value: string
    label: ReactNode
}

interface CustomSelectProps {
    value?: string | string[] | null
    onChange?: (value: string | null) => void
    onMultiChange?: (value: string[]) => void
    options: SelectOption[]
    placeholder?: string
    allowClear?: boolean
    multiple?: boolean
    disabled?: boolean
    style?: React.CSSProperties
}

export function CustomSelect({
    value,
    onChange,
    onMultiChange,
    options,
    placeholder = '请选择',
    allowClear = false,
    multiple = false,
    disabled = false,
    style,
}: CustomSelectProps) {
    return (
        <div className="cm-select-wrap" style={style} onClick={(event) => event.stopPropagation()}>
            <Select
                mode={multiple ? 'multiple' : undefined}
                value={
                    multiple
                        ? (Array.isArray(value) ? value : [])
                        : value == null
                            ? undefined
                            : String(value)
                }
                onChange={(nextValue) => {
                    if (multiple) {
                        const nextList = Array.isArray(nextValue)
                            ? nextValue.map((item) => String(item))
                            : []
                        onMultiChange?.(nextList)
                        return
                    }
                    onChange?.(nextValue == null ? null : String(nextValue))
                }}
                options={options}
                placeholder={placeholder}
                allowClear={allowClear}
                disabled={disabled}
                showSearch
                optionFilterProp="label"
                filterOption={(input, option) => {
                    const labelText =
                        typeof option?.label === 'string'
                            ? option.label
                            : String(option?.value ?? '')
                    return labelText.toLowerCase().includes(input.toLowerCase())
                }}
                maxTagCount={multiple ? 'responsive' : undefined}
                style={{ width: '100%' }}
            />
        </div>
    )
}
