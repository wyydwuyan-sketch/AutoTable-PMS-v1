import type { CSSProperties } from 'react'

interface IconProps {
    className?: string
    style?: CSSProperties
}

export function CheckboxCheckedIcon({ className, style }: IconProps) {
    return (
        <svg
            className={className}
            style={style}
            width="1em"
            height="1em"
            viewBox="0 0 1024 1024"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zM695.8 400.6l-233.6 256c-4.7 5.2-11.4 8.1-18.4 8.1s-13.7-2.9-18.4-8.1l-121.6-133.3a8.02 8.02 0 0 1 .6-11.3l39.8-36.4c3.4-3.1 8.8-2.9 12 .6l69.8 76.5 191.8-210.2c3.2-3.5 8.6-3.7 12-.6l39.8 36.4a8.08 8.08 0 0 1 .2 11.3z" />
        </svg>
    )
}

export function CheckboxEmptyIcon({ className, style }: IconProps) {
    return (
        <svg
            className={className}
            style={style}
            width="1em"
            height="1em"
            viewBox="0 0 1024 1024"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zm-40 728H184V184h656v656z" />
        </svg>
    )
}

export function EyeIcon({ className, style }: IconProps) {
    return (
        <svg
            className={className}
            style={style}
            width="1em"
            height="1em"
            viewBox="0 0 1024 1024"
            fill="currentColor"
            aria-hidden="true"
        >
            <path d="M942.2 486.2C847.4 286.5 694.5 186 512 186S176.6 286.5 81.8 486.2a48.4 48.4 0 0 0 0 51.6C176.6 737.5 329.5 838 512 838s335.4-100.5 430.2-300.2a48.4 48.4 0 0 0 0-51.6zM512 734c-128 0-240.5-74.6-321.1-222C271.5 364.6 384 290 512 290s240.5 74.6 321.1 222C752.5 659.4 640 734 512 734zm0-390a178 178 0 1 0 0 356 178 178 0 0 0 0-356zm0 288a110 110 0 1 1 0-220 110 110 0 0 1 0 220z" />
        </svg>
    )
}
