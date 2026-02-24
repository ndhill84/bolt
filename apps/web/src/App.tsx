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
  Story,
  StoryCountSummary,
  StoryDependency,
  StoryFilters,
  StoryStatus,
} from './lib/types'

const PRESET_STORAGE_KEY = 'bolt.board.preset'
const DOCK_MODE_STORAGE_KEY = 'bolt.agentDock.mode'

function App() {
  const [stories, setStories] = useState<Story[]>([])
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [dependencies, setDependencies] = useState<StoryDependency[]>([])
  const [files, setFiles] = useState<FileAsset[]>([])
  const [countsByStoryId, setCountsByStoryId] = useState<Record<string, StoryCountSummary>>({})

  const [newTitle, setNewTitle] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newDependencyId, setNewDependencyId] = useState('')
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

  const newStoryInputRef = useRef<HTMLInputElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (dockMode === 'pinned') setDockExpanded(true)
    if (dockMode === 'auto') setDockExpanded(false)
    localStorage.setItem(DOCK_MODE_STORAGE_KEY, dockMode)
  }, [dockMode])

  useEffect(() => {
    localStorage.setItem(PRESET_STORAGE_KEY, filters.preset)
  }, [filters.preset])

  async function loadStories() {
    const response = await fetch(`${API}/stories`)
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
            fetch(`${API}/files?storyId=${story.id}`),
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

  async function loadFiles(storyId?: string) {
    const query = storyId ? `?storyId=${storyId}` : ''
    const response = await fetch(`${API}/files${query}`)
    const json = await response.json()
    setFiles(json.data ?? [])
  }

  async function loadAgent() {
    const sessionsRes = await fetch(`${API}/agent/sessions`)
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
    loadStories().catch(console.error)
    loadAgent().catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedStory) return
    loadNotes(selectedStory.id).catch(console.error)
    loadDependencies(selectedStory.id).catch(console.error)
    loadFiles(selectedStory.id).catch(console.error)
  }, [selectedStory?.id])

  useEffect(() => {
    const interval = setInterval(() => {
      loadAgent().catch(console.error)
    }, 12000)
    return () => clearInterval(interval)
  }, [])

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
        newStoryInputRef.current?.focus()
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

  async function createStory() {
    if (!newTitle.trim()) return

    await fetch(`${API}/stories`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: newTitle, status: 'waiting', priority: 'med' }),
    })

    setNewTitle('')
    await loadStories()
    await loadAgent()
  }

  async function moveStory(story: Story, status: StoryStatus) {
    if (story.status === status) return

    await fetch(`${API}/stories/${story.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })

    await loadStories()
    await loadAgent()
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

    await loadStories()
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

    await loadStories()
  }

  async function addNote() {
    if (!selectedStory || !newNote.trim()) return

    await fetch(`${API}/stories/${selectedStory.id}/notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: newNote, author: 'Nick' }),
    })

    setNewNote('')
    await loadNotes(selectedStory.id)
    await loadStories()
  }

  async function addDependency() {
    if (!selectedStory || !newDependencyId.trim()) return

    await fetch(`${API}/stories/${selectedStory.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOnStoryId: newDependencyId }),
    })

    setNewDependencyId('')
    await Promise.all([loadDependencies(selectedStory.id), loadStories()])
  }

  async function addFile(storyId?: string, filenameOverride?: string) {
    const filename = (filenameOverride ?? newFilename).trim()
    if (!filename) return

    await fetch(`${API}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename,
        storyId: storyId ?? selectedStory?.id,
        uploadedBy: 'Nick',
        byteSize: 0,
      }),
    })

    setNewFilename('')
    await loadFiles(storyId ?? selectedStory?.id)
    await Promise.all([loadStories(), loadAgent()])
  }

  function openDrawer(story: Story, section: DrawerSection) {
    setSelectedStory(story)
    setDrawerSection(section)
    setDrawerOpen(true)
  }

  const filteredStories = useMemo(() => filterStories(stories, filters), [stories, filters])

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
          newTitle={newTitle}
          onNewTitleChange={setNewTitle}
          onCreateStory={createStory}
          filters={filters}
          onFilterChange={(changes) => setFilters((prev) => ({ ...prev, ...changes, preset: changes.preset ?? prev.preset }))}
          onSelectPreset={(preset) => setFilters((prev) => ({ ...prev, preset }))}
          storyInputRef={newStoryInputRef}
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
        newDependencyId={newDependencyId}
        newFilename={newFilename}
        onClose={() => setDrawerOpen(false)}
        onSectionChange={setDrawerSection}
        onStoryChange={setSelectedStory}
        onSaveStory={saveStoryEdit}
        onNewNoteChange={setNewNote}
        onNewDependencyIdChange={setNewDependencyId}
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
