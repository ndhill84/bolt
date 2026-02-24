import { columns } from '../lib/constants'
import type { Story, StoryCountSummary, StoryStatus } from '../lib/types'
import { Column } from './Column'

type Props = {
  storiesByStatus: Record<StoryStatus, Story[]>
  selectedStoryId?: string
  countsByStoryId: Record<string, StoryCountSummary>
  onSelectStory: (story: Story) => void
  onMoveStoryById: (storyId: string, status: StoryStatus) => Promise<void>
  onEditStory: (story: Story) => void
  onAddNote: (story: Story) => void
  onToggleBlocked: (story: Story) => void
  onAttachFile: (story: Story) => void
}

export function Board({
  storiesByStatus,
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {columns.map((column) => (
        <Column
          key={column.key}
          title={column.title}
          status={column.key}
          stories={storiesByStatus[column.key]}
          selectedStoryId={selectedStoryId}
          countsByStoryId={countsByStoryId}
          onSelectStory={onSelectStory}
          onMoveStoryById={onMoveStoryById}
          onEditStory={onEditStory}
          onAddNote={onAddNote}
          onToggleBlocked={onToggleBlocked}
          onAttachFile={onAttachFile}
        />
      ))}
    </div>
  )
}
