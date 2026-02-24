import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentDock } from './components/AgentDock'
import { Board } from './components/Board'
import { StoryDrawer } from './components/StoryDrawer'
import { TopBar } from './components/TopBar'
import { API } from './lib/constants'
import { filterStories } from './lib/filters'
import type {
  AgentEvent,
  AgentSession,
  DockMode,
  DrawerSection,
  FileAsset,
  FilterPresetId,
  Note,
  Project,
  Story,
  StoryCountSummary,
  StoryDependency,
  StoryFilters,
  StoryStatus,
} from './lib/types'

const PRESET_STORAGE_KEY = 'bolt.board.preset'
const DOCK_MODE_STORAGE_KEY = 'bolt.agentDock.mode'
const ASSIGNEE_OPTIONS_STORAGE_KEY = 'bolt.assignees'

function App() {
  const [stories, setStories] = useState<Story[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [dependencies, setDependencies] = useState<StoryDependency[]>([])
  const [files, setFiles] = useState<FileAsset[]>([])
  const [countsByStoryId, setCountsByStoryId] = useState<Record<string, StoryCountSummary>>({})

  const [isCreatingStory, setIsCreatingStory] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [newDependencyIds, setNewDependencyIds] = useState<string[]>([''])
  const [newFilename, setNewFilename] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerSection, setDrawerSection] = useState<DrawerSection>('details')

  const [filters, setFilters] = useState<StoryFilters>({
    search: '',
    status: 'all',
    assignee: '',
    preset: (localStorage.getItem(PRESET_STORAGE_KEY) as FilterPresetId) || 'all',
  })

  const [dockMode, setDockMode] = useState<DockMode>((localStorage.getItem(DOCK_MODE_STORAGE_KEY) as DockMode) || 'auto')
  const [dockExpanded, setDockExpanded] = useState(false)

  const [agentSession, setAgentSession] = useState<AgentSession | null>(null)
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>(() => {
    const saved = localStorage.getItem(ASSIGNEE_OPTIONS_STORAGE_KEY)
    if (!saved) return ['You', 'Claudio']
    try {
      const parsed = JSON.parse(saved) as string[]
      return parsed.length ? parsed : ['You', 'Claudio']
    } catch {
      return ['You', 'Claudio']
    }
  })

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (dockMode === 'pinned') setDockExpanded(true)
    if (dockMode === 'auto') setDockExpanded(false)
    localStorage.setItem(DOCK_MODE_STORAGE_KEY, dockMode)
  }, [dockMode])

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, filters.preset)
  }, [filters.preset])

  useEffect(() => {
    localStorage.setItem(ASSIGNEE_OPTIONS_STORAGE_KEY, JSON.stringify(assigneeOptions))
  }, [assigneeOptions])

  async function loadProjects() {
    const fallbackProjects: Project[] = [
      { id: 'all', name: 'All Projects' },
      { id: 'demo-calc', name: 'Demo: Scientific Calculator' },
      { id: 'demo-weather', name: 'Demo: CLI Weather App' },
      { id: 'core', name: 'Core / Other' },
    ]

    try {
      const response = await fetch(`${API}/projects`)
      if (!response.ok) throw new Error('projects endpoint unavailable')
      const json = await response.json()
      const apiProjects = (json.data ?? []) as Project[]
      const nextProjects = [{ id: 'all', name: 'All Projects' }, ...apiProjects]
      setProjects(nextProjects)
      if (!nextProjects.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId('all')
        return 'all'
      }
      return selectedProjectId
    } catch {
      setProjects(fallbackProjects)
      return selectedProjectId
    }
  }

  async function loadStories(projectId = selectedProjectId) {
    const query = projectId === 'all' ? '' : `?projectId=${encodeURIComponent(projectId)}`
    const response = await fetch(`${API}/stories${query}`)
    const json = await response.json()
    const nextStories = (json.data ?? []) as Story[]
    setStories(nextStories)
    void loadStoryCounts(nextStories)
  }

  async function loadStoryCounts(storyList: Story[]) {
    const entries = await Promise.all(
      storyList.map(async (story) => {
        try {
          const [notesRes, depsRes, filesRes] = await Promise.all([
            fetch(`${API}/stories/${story.id}/notes`),
            fetch(`${API}/stories/${story.id}/dependencies`),
            fetch(
              `${API}/files?storyId=${story.id}${selectedProjectId === 'all' ? '' : `&projectId=${encodeURIComponent(selectedProjectId)}`}`,
            ),
          ])
          const [notesJson, depsJson, filesJson] = await Promise.all([notesRes.json(), depsRes.json(), filesRes.json()])
          return [
            story.id,
            {
              noteCount: notesJson.data?.length ?? 0,
              dependencyCount: depsJson.data?.length ?? 0,
              fileCount: filesJson.data?.length ?? 0,
            },
          ] as const
        } catch {
          return [story.id, { noteCount: 0, dependencyCount: 0, fileCount: 0 }] as const
        }
      }),
    )
    setCountsByStoryId(Object.fromEntries(entries))
  }

  async function loadNotes(storyId: string) {
    const response = await fetch(`${API}/stories/${storyId}/notes`)
    const json = await response.json()
    setNotes(json.data ?? [])
  }

  async function loadDependencies(storyId: string) {
    const response = await fetch(`${API}/stories/${storyId}/dependencies`)
    const json = await response.json()
    setDependencies(json.data ?? [])
  }

  async function loadFiles(storyId?: string, projectId = selectedProjectId) {
    const projectParam = projectId === 'all' ? '' : `projectId=${encodeURIComponent(projectId)}`
    const query = storyId
      ? `?storyId=${storyId}${projectParam ? `&${projectParam}` : ''}`
      : projectParam
        ? `?${projectParam}`
        : ''
    const response = await fetch(`${API}/files${query}`)
    const json = await response.json()
    setFiles(json.data ?? [])
  }

  async function loadAgent(projectId = selectedProjectId) {
    const query = projectId === 'all' ? '' : `?projectId=${encodeURIComponent(projectId)}`
    const sessionsRes = await fetch(`${API}/agent/sessions${query}`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson?.data?.[0] as AgentSession | undefined
    setAgentSession(session ?? null)

    if (session?.id) {
      const eventsRes = await fetch(`${API}/agent/sessions/${session.id}/events`)
      const eventsJson = await eventsRes.json()
      setAgentEvents(eventsJson.data ?? [])
    }
  }

  useEffect(() => {
    ;(async () => {
      const projectId = await loadProjects()
      await Promise.all([loadStories(projectId), loadAgent(projectId)])
    })().catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedStory) return
    loadNotes(selectedStory.id).catch(console.error)
    loadDependencies(selectedStory.id).catch(console.error)
    loadFiles(selectedStory.id, selectedProjectId).catch(console.error)
  }, [selectedStory?.id, selectedProjectId])

  useEffect(() => {
    setSelectedStory(null)
    setIsCreatingStory(false)
    setDrawerOpen(false)
    loadStories(selectedProjectId).catch(console.error)
    loadAgent(selectedProjectId).catch(console.error)
  }, [selectedProjectId])

  useEffect(() => {
    const interval = setInterval(() => {
      loadAgent(selectedProjectId).catch(console.error)
    }, 12000)
    return () => clearInterval(interval)
  }, [selectedProjectId])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTypingElement = target?.matches('input, textarea, select, [contenteditable="true"]')

      if (event.key === 'Escape') {
        setDrawerOpen(false)
        return
      }

      if (isTypingElement) return

      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        openNewStoryDrawer()
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }

      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setDockMode((prev) => (prev === 'auto' ? 'pinned' : 'auto'))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function addAssigneeOption() {
    const next = window.prompt('Add assignee name')?.trim()
    if (!next) return
    setAssigneeOptions((prev) => {
      if (prev.some((item) => item.toLowerCase() === next.toLowerCase())) return prev
      return [...prev, next]
    })
  }

  async function createProject() {
    const name = window.prompt('New project name')?.trim()
    if (!name || name.toLowerCase() === 'all projects') return

    const description = window.prompt('Project description (optional)')?.trim() || undefined

    const response = await fetch(`${API}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })

    if (!response.ok) return
    const json = await response.json()
    const created = json.data as Project
    await loadProjects()
    setSelectedProjectId(created.id)
  }

  async function editProject() {
    if (selectedProjectId === 'all') return
    const current = projects.find((project) => project.id === selectedProjectId)
    if (!current) return

    const name = window.prompt('Edit project name', current.name)?.trim()
    if (!name) return
    const description = window.prompt('Edit project description', current.description ?? '')?.trim() || undefined

    const response = await fetch(`${API}/projects/${selectedProjectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })

    if (!response.ok) return
    await loadProjects()
  }

  function openNewStoryDrawer() {
    const projectId = selectedProjectId === 'all' ? 'core' : selectedProjectId
    setSelectedStory({
      id: 'new-story',
      projectId,
      title: '',
      description: '',
      status: 'waiting',
      priority: 'med',
      blocked: false,
      assignee: 'You',
      updatedAt: new Date().toISOString(),
    })
    setIsCreatingStory(true)
    setDrawerSection('details')
    setDrawerOpen(true)
    setNotes([])
    setDependencies([])
    setFiles([])
    setNewNote('')
    setNewDependencyIds([''])
  }

  async function moveStory(story: Story, status: StoryStatus) {
    if (story.status === status) return

    await fetch(`${API}/stories/${story.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    await loadStories(selectedProjectId)
    await loadAgent(selectedProjectId)
    if (selectedStory?.id === story.id) {
      setSelectedStory({ ...story, status })
    }
  }

  async function moveStoryById(storyId: string, status: StoryStatus) {
    const story = stories.find((item) => item.id === storyId)
    if (story) {
      await moveStory(story, status)
    }
  }

  async function saveStoryEdit() {
    if (!selectedStory) return

    if (isCreatingStory) {
      if (!selectedStory.title.trim()) return
      const createResponse = await fetch(`${API}/stories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId === 'all' ? 'core' : selectedProjectId,
          title: selectedStory.title,
          description: selectedStory.description,
          priority: selectedStory.priority,
          assignee: selectedStory.assignee,
          status: selectedStory.status,
        }),
      })

      const createdJson = await createResponse.json()
      const createdId = createdJson?.data?.id as string | undefined

      if (createdId) {
        if (newNote.trim()) {
          await fetch(`${API}/stories/${createdId}/notes`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ body: newNote.trim(), author: 'you' }),
          })
        }

        const depIds = newDependencyIds.map((item) => item.trim()).filter(Boolean)

        for (const depId of depIds) {
          await fetch(`${API}/stories/${createdId}/dependencies`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ dependsOnStoryId: depId }),
          })
        }
      }

      setNewNote('')
      setNewDependencyIds([''])
      setIsCreatingStory(false)
      setDrawerOpen(false)
      setSelectedStory(null)
      await Promise.all([loadStories(selectedProjectId), loadAgent(selectedProjectId)])
      return
    }

    await fetch(`${API}/stories/${selectedStory.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: selectedStory.title,
        description: selectedStory.description,
        priority: selectedStory.priority,
        assignee: selectedStory.assignee,
        blocked: selectedStory.blocked,
      }),
    })

    await loadStories(selectedProjectId)
  }

  async function toggleBlocked(story: Story) {
    await fetch(`${API}/stories/${story.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: story.title,
        description: story.description,
        priority: story.priority,
        assignee: story.assignee,
        blocked: !story.blocked,
      }),
    })

    if (selectedStory?.id === story.id) {
      setSelectedStory({ ...selectedStory, blocked: !story.blocked })
    }

    await loadStories(selectedProjectId)
  }

  async function addNote() {
    if (!selectedStory || !newNote.trim()) return

    await fetch(`${API}/stories/${selectedStory.id}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: newNote, author: 'you' }),
    })

    setNewNote('')
    await loadNotes(selectedStory.id)
    await loadStories(selectedProjectId)
  }

  async function addDependency() {
    const depId = newDependencyIds[0]?.trim()
    if (!selectedStory || !depId) return

    await fetch(`${API}/stories/${selectedStory.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOnStoryId: depId }),
    })

    setNewDependencyIds([''])
    await Promise.all([loadDependencies(selectedStory.id), loadStories(selectedProjectId)])
  }

  async function addFile(storyId?: string, filenameOverride?: string) {
    const filename = (filenameOverride ?? newFilename).trim()
    if (!filename) return

    await fetch(`${API}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename,
        projectId: selectedProjectId,
        storyId: storyId ?? selectedStory?.id,
        uploadedBy: 'you',
        byteSize: 0,
      }),
    })

    setNewFilename('')
    await loadFiles(storyId ?? selectedStory?.id, selectedProjectId)
    await Promise.all([loadStories(selectedProjectId), loadAgent(selectedProjectId)])
  }

  function openDrawer(story: Story, section: DrawerSection) {
    setIsCreatingStory(false)
    setSelectedStory(story)
    setDrawerSection(section)
    setDrawerOpen(true)
  }

  const filteredStories = useMemo(() => {
    const byProject = stories.filter((story) => selectedProjectId === 'all' || story.projectId === selectedProjectId)
    return filterStories(byProject, filters)
  }, [stories, filters, selectedProjectId])

  const storiesByStatus = useMemo(
    () => ({
      waiting: filteredStories.filter((story) => story.status === 'waiting'),
      in_progress: filteredStories.filter((story) => story.status === 'in_progress'),
      completed: filteredStories.filter((story) => story.status === 'completed'),
    }),
    [filteredStories],
  )

  return (
    <main className="theme-dark min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="mx-auto max-w-[1500px] px-4 pb-44 pt-4">
        <TopBar
          onOpenNewStory={openNewStoryDrawer}
          filters={filters}
          onFilterChange={(changes) => setFilters((prev) => ({ ...prev, ...changes, preset: changes.preset ?? prev.preset }))}
          onSelectPreset={(preset) => setFilters((prev) => ({ ...prev, preset }))}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={setSelectedProjectId}
          onCreateProject={createProject}
          onEditProject={editProject}
          searchInputRef={searchInputRef}
        />

        <Board
          storiesByStatus={storiesByStatus}
          selectedStoryId={selectedStory?.id}
          countsByStoryId={countsByStoryId}
          onSelectStory={(story) => openDrawer(story, 'details')}
          onMoveStoryById={moveStoryById}
          onEditStory={(story) => openDrawer(story, 'details')}
          onAddNote={(story) => openDrawer(story, 'notes')}
          onToggleBlocked={(story) => void toggleBlocked(story)}
          onAttachFile={(story) => {
            const filename = window.prompt('Filename to attach')
            if (!filename?.trim()) return
            void addFile(story.id, filename.trim())
          }}
        />
      </div>

      <StoryDrawer
        open={drawerOpen}
        story={selectedStory}
        section={drawerSection}
        notes={notes}
        dependencies={dependencies}
        files={files}
        newNote={newNote}
        newDependencyIds={newDependencyIds}
        dependencyOptions={stories
          .filter((story) => (selectedProjectId === 'all' ? true : story.projectId === selectedProjectId) && story.id !== selectedStory?.id)
          .map((story) => ({ id: story.id, title: story.title }))}
        assigneeOptions={assigneeOptions}
        onAddAssigneeOption={addAssigneeOption}
        newFilename={newFilename}
        onClose={() => {
          setDrawerOpen(false)
          setIsCreatingStory(false)
          setNewNote('')
          setNewDependencyIds([''])
        }}
        onSectionChange={setDrawerSection}
        onStoryChange={setSelectedStory}
        isCreatingStory={isCreatingStory}
        onSaveStory={saveStoryEdit}
        onNewNoteChange={setNewNote}
        onNewDependencyIdsChange={setNewDependencyIds}
        onNewFilenameChange={setNewFilename}
        onAddNote={addNote}
        onAddDependency={addDependency}
        onAddFile={() => addFile()}
      />

      <AgentDock
        mode={dockMode}
        expanded={dockExpanded}
        session={agentSession}
        events={agentEvents}
        onToggleMode={() => setDockMode((prev) => (prev === 'auto' ? 'pinned' : 'auto'))}
        onToggleExpanded={() => setDockExpanded((prev) => !prev)}
      />
    </main>
  )
}

export default App
