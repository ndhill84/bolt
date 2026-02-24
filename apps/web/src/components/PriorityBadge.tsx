import { priorityMeta } from '../lib/constants'
import type { Priority } from '../lib/types'

type Props = {
  priority: Priority
}

export function PriorityBadge({ priority }: Props) {
  const meta = priorityMeta[priority]

  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: `${meta.tone}70`, color: meta.tone, backgroundColor: `${meta.tone}22` }}
    >
      {meta.label}
    </span>
  )
}
