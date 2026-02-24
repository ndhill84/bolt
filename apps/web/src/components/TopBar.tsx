import { FilterPresets } from './FilterPresets'
import type { RefObject } from 'react'
import type { FilterPresetId, Project, StoryFilters, StoryStatus } from '../lib/types'

type Props = {
  onOpenNewStory: () => void
  filters: StoryFilters
  onFilterChange: (changes: Partial<StoryFilters>) => void
  onSelectPreset: (preset: FilterPresetId) => void
  projects: Project[]
  selectedProjectId: string
  onProjectChange: (projectId: string) => void
  onCreateProject: () => Promise<void>
  onEditProject: () => Promise<void>
  searchInputRef: RefObject<HTMLInputElement | null>
}

const statusOptions: Array<{ value: 'all' | StoryStatus; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

export function TopBar({
  onOpenNewStory,
  filters,
  onFilterChange,
  onSelectPreset,
  projects,
  selectedProjectId,
  onProjectChange,
  onCreateProject,
  onEditProject,
  searchInputRef,
}: Props) {
  return (
    <header className="mb-4 rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
            <img src="/bolt-logo.svg" alt="Bolt" className="h-6 w-6" />
            <span>Bolt Sprint Board</span>
          </h1>
          <p className="text-xs text-[var(--color-text-muted)]">Compact board with status-safe signaling and quick card actions.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-field w-56"
            aria-label="Project"
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <button type="button" className="ghost-btn" onClick={() => void onCreateProject()}>
            + Project
          </button>
          <button type="button" className="ghost-btn" onClick={() => void onEditProject()} disabled={selectedProjectId === 'all'}>
            Edit Project
          </button>
          <button type="button" className="primary-btn" onClick={onOpenNewStory}>
            New Story
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
