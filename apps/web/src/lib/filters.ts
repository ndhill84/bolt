import { CURRENT_USER } from './constants'
import type { FilterPresetId, Story, StoryFilters } from './types'

export function applyPreset(story: Story, preset: FilterPresetId) {
  switch (preset) {
    case 'my_work':
      return (story.assignee ?? '').toLowerCase() === CURRENT_USER.toLowerCase()
    case 'blocked':
      return story.blocked
    case 'urgent':
      return story.priority === 'urgent'
    case 'ready_to_ship':
      return story.status === 'completed' && !story.blocked
    default:
      return true
  }
}

export function filterStories(stories: Story[], filters: StoryFilters) {
  const search = filters.search.trim().toLowerCase()
  const assignee = filters.assignee.trim().toLowerCase()

  return stories.filter((story) => {
    if (!applyPreset(story, filters.preset)) return false
    if (filters.status !== 'all' && story.status !== filters.status) return false
    if (assignee && !(story.assignee ?? '').toLowerCase().includes(assignee)) return false
    if (!search) return true

    return (
      story.title.toLowerCase().includes(search) ||
      story.id.toLowerCase().includes(search) ||
      (story.description ?? '').toLowerCase().includes(search)
    )
  })
}
