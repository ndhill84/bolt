import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function BaseIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      {props.children}
    </svg>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6.6v3.8l2.3 1.7" />
    </BaseIcon>
  )
}

export function PlayIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 5.8l7 4.2-7 4.2z" />
    </BaseIcon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.7 10.4l2.7 2.8 5.9-6.2" />
    </BaseIcon>
  )
}

export function BlockIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="10" cy="10" r="7" />
      <path d="M6.2 13.8l7.6-7.6" />
    </BaseIcon>
  )
}

export function EditIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.3 13.9l-.4 2.6 2.6-.4L14.5 8a1.3 1.3 0 000-1.8L13.8 5a1.3 1.3 0 00-1.8 0z" />
    </BaseIcon>
  )
}

export function NoteIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M5.2 3.8h9.6a1 1 0 011 1v10.4a1 1 0 01-1 1H5.2a1 1 0 01-1-1V4.8a1 1 0 011-1z" />
      <path d="M7 7.1h6M7 10h6M7 12.9h4.2" />
    </BaseIcon>
  )
}

export function PaperclipIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7.4 10.9l4.3-4.3a2.3 2.3 0 013.2 3.2L9 15.7a3.6 3.6 0 01-5.1-5.1l6.3-6.3" />
    </BaseIcon>
  )
}

export function CountIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.3 5.3h11.4v9.4H4.3z" />
      <path d="M6.8 8.1h6.4M6.8 10.7h4.4" />
    </BaseIcon>
  )
}
