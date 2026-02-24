import { BlockIcon } from './icons'

type Props = {
  blocked: boolean
}

export function BlockedBadge({ blocked }: Props) {
  if (!blocked) return null

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: 'var(--status-blocked)', color: 'var(--status-blocked)', backgroundColor: 'var(--status-blocked-bg)' }}
    >
      <BlockIcon className="h-3.5 w-3.5" />
      <span>Blocked</span>
    </span>
  )
}
