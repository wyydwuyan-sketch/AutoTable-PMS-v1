import type { CSSProperties, KeyboardEvent } from 'react'
import type { FieldOption } from '../types/grid'

interface LinkedSelectProps {
  className?: string
  value: string
  options: FieldOption[]
  autoFocus?: boolean
  placeholder?: string
  style?: CSSProperties
  onChange: (value: string) => void
  onBlur?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLSelectElement>) => void
}

export function LinkedSelect({
  className,
  value,
  options,
  autoFocus,
  placeholder = '请选择',
  style,
  onChange,
  onBlur,
  onKeyDown,
}: LinkedSelectProps) {
  const hasCurrent = value !== ''
  const hasCurrentInOptions = options.some((option) => option.id === value)

  return (
    <select
      className={className}
      autoFocus={autoFocus}
      style={style}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {hasCurrent && !hasCurrentInOptions ? (
        <option value={value}>{value}</option>
      ) : null}
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}
