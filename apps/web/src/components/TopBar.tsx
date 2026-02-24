import { FilterPresets } from './FilterPresets'
import type { RefObject } from 'react'
import type { FilterPresetId, StoryFilters, StoryStatus } from '../lib/types'

type Props = {
  newTitle: string
  onNewTitleChange: (value: string) => void
  onCreateStory: () => Promise<void>
  filters: StoryFilters
  onFilterChange: (changes: Partial<StoryFilters>) => void
  onSelectPreset: (preset: FilterPresetId) => void
  storyInputRef: RefObject<HTMLInputElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
}

const statusOptions: Array<{ value: 'all' | StoryStatus; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

export function TopBar({
  newTitle,
  onNewTitleChange,
  onCreateStory,
  filters,
  onFilterChange,
  onSelectPreset,
  storyInputRef,
  searchInputRef,
}: Props) {
  return (
    <header className="mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Bolt Sprint Board</h1>
          <p className="text-xs text-[var(--color-text-muted)]">Compact board with status-safe signaling and quick card actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={storyInputRef}
            value={newTitle}
            onChange={(event) => onNewTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onCreateStory()
              }
            }}
            placeholder="New story title"
            className="input-field w-64"
            aria-label="New story title"
          />
          <button type="button" className="primary-btn" onClick={() => void onCreateStory()}>
            Add Story
          </button>
        </div>
      </div>

      <div className="mb-3">
        <FilterPresets activePreset={filters.preset} onSelectPreset={onSelectPreset} />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
        <input
          ref={searchInputRef}
          value={filters.search}
          onChange={(event) => onFilterChange({ search: event.target.value })}
          placeholder="Search by title, id, or description"
          className="input-field"
          aria-label="Search stories"
        />
        <select
          value={filters.status}
          onChange={(event) => onFilterChange({ status: event.target.value as StoryFilters['status'] })}
          className="input-field"
          aria-label="Filter by status"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          value={filters.assignee}
          onChange={(event) => onFilterChange({ assignee: event.target.value })}
          placeholder="Assignee"
          className="input-field"
          aria-label="Filter by assignee"
        />
        <div className="rounded-lg border px-2 py-2 text-[11px]" style={{ borderColor: 'var(--color-border-soft)', color: 'var(--color-text-muted)' }}>
          Shortcuts: N new, F search, Esc drawer, A dock mode
        </div>
      </div>
    </header>
  )
}
