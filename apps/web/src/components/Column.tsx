import type { Story, StoryCountSummary, StoryStatus } from '../lib/types'
import { StoryCard } from './StoryCard'

type Props = {
  title: string
  status: StoryStatus
  stories: Story[]
  selectedStoryId?: string
  countsByStoryId: Record<string, StoryCountSummary>
  onSelectStory: (story: Story) => void
  onMoveStoryById: (storyId: string, status: StoryStatus) => Promise<void>
  onEditStory: (story: Story) => void
  onAddNote: (story: Story) => void
  onToggleBlocked: (story: Story) => void
  onAttachFile: (story: Story) => void
}

export function Column({
  title,
  status,
  stories,
  selectedStoryId,
  countsByStoryId,
  onSelectStory,
  onMoveStoryById,
  onEditStory,
  onAddNote,
  onToggleBlocked,
  onAttachFile,
}: Props) {
  return (
    <section
      className="rounded-2xl border p-3"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={async (event) => {
        const id = event.dataTransfer.getData('storyId')
        if (id) {
          await onMoveStoryById(id, status)
        }
      }}
    >
      <header className="mb-3 flex items-center justify-between border-b pb-2" style={{ borderColor: 'var(--color-border-soft)' }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h2>
        <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-subtle)' }}>
          {stories.length}
        </span>
      </header>
      <div className="grid gap-2">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            selected={story.id === selectedStoryId}
            counts={countsByStoryId[story.id] ?? { noteCount: 0, fileCount: 0, dependencyCount: 0 }}
            onSelect={onSelectStory}
            onEdit={onEditStory}
            onAddNote={onAddNote}
            onToggleBlocked={onToggleBlocked}
            onAttachFile={onAttachFile}
          />
        ))}
        {!stories.length && (
          <div className="rounded-xl border border-dashed px-3 py-8 text-center text-xs" style={{ borderColor: 'var(--color-border-soft)', color: 'var(--color-text-muted)' }}>
            No stories.
          </div>
        )}
      </div>
    </section>
  )
}
