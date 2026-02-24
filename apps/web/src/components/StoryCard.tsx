import type { Story, StoryCountSummary } from '../lib/types'
import { BlockedBadge } from './BlockedBadge'
import { CountBadge } from './CountBadge'
import { EditIcon, NoteIcon, PaperclipIcon, BlockIcon, CountIcon } from './icons'
import { PriorityBadge } from './PriorityBadge'
import { StatusBadge } from './StatusBadge'

type Props = {
  story: Story
  selected: boolean
  counts: StoryCountSummary
  onSelect: (story: Story) => void
  onEdit: (story: Story) => void
  onAddNote: (story: Story) => void
  onToggleBlocked: (story: Story) => void
  onAttachFile: (story: Story) => void
}

export function StoryCard({
  story,
  selected,
  counts,
  onSelect,
  onEdit,
  onAddNote,
  onToggleBlocked,
  onAttachFile,
}: Props) {
  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData('storyId', story.id)}
      onClick={() => onSelect(story)}
      className="group cursor-pointer rounded-xl border p-3 transition"
      style={{
        borderColor: selected ? 'var(--color-accent)' : 'var(--color-border)',
        backgroundColor: selected ? 'var(--color-surface-selected)' : 'var(--color-surface)',
        boxShadow: selected ? '0 0 0 1px color-mix(in oklab, var(--color-accent) 45%, transparent)' : 'none',
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)]">{story.title}</p>
        <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            className="quick-action"
            title="Edit story"
            onClick={(event) => {
              event.stopPropagation()
              onEdit(story)
            }}
          >
            <EditIcon className="h-3.5 w-3.5" />
          </button>
          <button
            className="quick-action"
            title="Add note"
            onClick={(event) => {
              event.stopPropagation()
              onAddNote(story)
            }}
          >
            <NoteIcon className="h-3.5 w-3.5" />
          </button>
          <button
            className="quick-action"
            title={story.blocked ? 'Unblock story' : 'Block story'}
            onClick={(event) => {
              event.stopPropagation()
              onToggleBlocked(story)
            }}
          >
            <BlockIcon className="h-3.5 w-3.5" />
          </button>
          <button
            className="quick-action"
            title="Attach file"
            onClick={(event) => {
              event.stopPropagation()
              onAttachFile(story)
            }}
          >
            <PaperclipIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        <StatusBadge status={story.status} />
        <PriorityBadge priority={story.priority} />
        <BlockedBadge blocked={story.blocked} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <CountBadge label="Notes" count={counts.noteCount} icon={<NoteIcon className="h-3.5 w-3.5" />} />
        <CountBadge label="Files" count={counts.fileCount} icon={<PaperclipIcon className="h-3.5 w-3.5" />} />
        <CountBadge label="Dependencies" count={counts.dependencyCount} icon={<CountIcon className="h-3.5 w-3.5" />} />
      </div>

      <div className="mt-2 flex justify-between text-[11px] text-[var(--color-text-muted)]">
        <span>{story.assignee ? `@${story.assignee}` : 'Unassigned'}</span>
        <span>{new Date(story.updatedAt).toLocaleDateString()}</span>
      </div>
    </article>
  )
}
