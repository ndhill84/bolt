import type { ReactNode } from 'react'

type Props = {
  label: string
  count: number
  icon: ReactNode
}

export function CountBadge({ label, count, icon }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: 'var(--color-border-soft)', color: 'var(--color-text-muted)', backgroundColor: 'var(--color-surface-raised)' }}
      title={`${count} ${label}`}
    >
      {icon}
      <span>{count}</span>
    </span>
  )
}
