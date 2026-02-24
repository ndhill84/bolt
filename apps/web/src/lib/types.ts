export type StoryStatus = 'waiting' | 'in_progress' | 'completed'
export type Priority = 'low' | 'med' | 'high' | 'urgent'

export type Story = {
  id: string
  projectId?: string
  title: string
  description?: string
  status: StoryStatus
  priority: Priority
  blocked: boolean
  assignee?: string
  updatedAt: string
}

export type Project = {
  id: string
  name: string
  description?: string
}

export type Note = {
  id: string
  storyId: string
  author: string
  body: string
  createdAt: string
}

export type StoryDependency = {
  id: string
  storyId: string
  dependsOnStoryId: string
  createdAt: string
}

export type FileAsset = {
  id: string
  storyId?: string
  filename: string
  uploadedBy: string
  createdAt: string
}

export type AgentSession = {
  id: string
  title: string
  state: string
  startedAt: string
  lastHeartbeatAt: string
}

export type AgentEvent = {
  id: string
  type: string
  message: string
  createdAt: string
}

export type DrawerSection = 'details' | 'notes' | 'dependencies' | 'files'
export type DockMode = 'auto' | 'pinned'

export type StoryCountSummary = {
  noteCount: number
  fileCount: number
  dependencyCount: number
}

export type FilterPresetId = 'all' | 'my_work' | 'blocked' | 'urgent' | 'ready_to_ship'

export type StoryFilters = {
  search: string
  status: 'all' | StoryStatus
  assignee: string
  preset: FilterPresetId
}
