import { statusMeta } from '../lib/constants'
import type { StoryStatus } from '../lib/types'
import { CheckIcon, ClockIcon, PlayIcon } from './icons'

type Props = {
  status: StoryStatus
}

export function StatusBadge({ status }: Props) {
  const meta = statusMeta[status]
  const iconClass = 'h-3.5 w-3.5'
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: `${meta.tone}70`, color: meta.tone, backgroundColor: `${meta.tone}22` }}
    >
      {meta.icon === 'clock' && <ClockIcon className={iconClass} />}
      {meta.icon === 'play' && <PlayIcon className={iconClass} />}
      {meta.icon === 'check' && <CheckIcon className={iconClass} />}
      <span>{meta.label}</span>
    </span>
  )
}
