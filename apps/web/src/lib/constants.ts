import type { FilterPresetId, Priority, StoryStatus } from './types'

export const API = 'http://localhost:4000/api/v1'
export const CURRENT_USER = 'Nick'

export const columns: { key: StoryStatus; title: string }[] = [
  { key: 'waiting', title: 'Waiting' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'completed', title: 'Completed' },
]

export const statusMeta: Record<StoryStatus, { label: string; icon: 'clock' | 'play' | 'check'; tone: string }> = {
  waiting: { label: 'Waiting', icon: 'clock', tone: 'var(--status-waiting)' },
  in_progress: { label: 'In Progress', icon: 'play', tone: 'var(--status-progress)' },
  completed: { label: 'Completed', icon: 'check', tone: 'var(--status-completed)' },
}

export const priorityMeta: Record<Priority, { label: string; tone: string }> = {
  low: { label: 'Low', tone: 'var(--priority-low)' },
  med: { label: 'Medium', tone: 'var(--priority-med)' },
  high: { label: 'High', tone: 'var(--priority-high)' },
  urgent: { label: 'Urgent', tone: 'var(--priority-urgent)' },
}

export const presetLabels: Record<FilterPresetId, string> = {
  all: 'All',
  my_work: 'My Work',
  blocked: 'Blocked',
  urgent: 'Urgent',
  ready_to_ship: 'Ready to Ship',
}
