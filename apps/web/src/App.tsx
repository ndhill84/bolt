import { useEffect, useMemo, useState } from 'react'
import './App.css'

type StoryStatus = 'waiting' | 'in_progress' | 'completed'
type Priority = 'low' | 'med' | 'high' | 'urgent'

type Story = {
  id: string
  title: string
  description?: string
  status: StoryStatus
  priority: Priority
  blocked: boolean
  assignee?: string
  updatedAt: string
}

type Note = {
  id: string
  storyId: string
  author: string
  body: string
  createdAt: string
}

type FileAsset = {
  id: string
  storyId?: string
  filename: string
  uploadedBy: string
  createdAt: string
}

type AgentSession = {
  id: string
  title: string
  state: string
  startedAt: string
  lastHeartbeatAt: string
}

type AgentEvent = {
  id: string
  type: string
  message: string
  createdAt: string
}

const API = 'http://localhost:4000/api/v1'

const columns: { key: StoryStatus; title: string }[] = [
  { key: 'waiting', title: 'Waiting' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'completed', title: 'Completed' },
]

function App() {
  const [stories, setStories] = useState<Story[]>([])
  const [selectedStory, setSelectedStory] = useState<Story | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [newNote, setNewNote] = useState('')
  const [newDependencyId, setNewDependencyId] = useState('')
  const [files, setFiles] = useState<FileAsset[]>([])
  const [newFilename, setNewFilename] = useState('')
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null)
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([])

  async function loadStories() {
    const res = await fetch(`${API}/stories`)
    const json = await res.json()
    setStories(json.data ?? [])
  }

  async function loadNotes(storyId: string) {
    const res = await fetch(`${API}/stories/${storyId}/notes`)
    const json = await res.json()
    setNotes(json.data ?? [])
  }

  async function loadFiles(storyId?: string) {
    const qs = storyId ? `?storyId=${storyId}` : ''
    const res = await fetch(`${API}/files${qs}`)
    const json = await res.json()
    setFiles(json.data ?? [])
  }

  async function loadAgent() {
    const sessionsRes = await fetch(`${API}/agent/sessions`)
    const sessionsJson = await sessionsRes.json()
    const session = sessionsJson?.data?.[0]
    setAgentSession(session ?? null)
    if (session?.id) {
      const eventsRes = await fetch(`${API}/agent/sessions/${session.id}/events`)
      const eventsJson = await eventsRes.json()
      setAgentEvents(eventsJson.data ?? [])
    }
  }

  useEffect(() => {
    loadStories().catch(console.error)
    loadFiles().catch(console.error)
    loadAgent().catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedStory) return
    loadNotes(selectedStory.id).catch(console.error)
    loadFiles(selectedStory.id).catch(console.error)
  }, [selectedStory?.id])

  useEffect(() => {
    const t = setInterval(() => {
      loadAgent().catch(console.error)
    }, 12000)
    return () => clearInterval(t)
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
      }),
    })
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
  }

  async function addDependency() {
    if (!selectedStory || !newDependencyId.trim()) return
    await fetch(`${API}/stories/${selectedStory.id}/dependencies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dependsOnStoryId: newDependencyId }),
    })
    setNewDependencyId('')
    await loadStories()
  }

  async function addFile() {
    if (!newFilename.trim()) return
    await fetch(`${API}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename: newFilename,
        storyId: selectedStory?.id,
        uploadedBy: 'Nick',
        byteSize: 0,
      }),
    })
    setNewFilename('')
    await loadFiles(selectedStory?.id)
    await loadAgent()
  }

  const byStatus = useMemo(() => {
    return {
      waiting: stories.filter((s) => s.status === 'waiting'),
      in_progress: stories.filter((s) => s.status === 'in_progress'),
      completed: stories.filter((s) => s.status === 'completed'),
    }
  }, [stories])

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>Bolt — Sprint Board</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="New story title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ padding: 8, minWidth: 300 }}
        />
        <button onClick={createStory}>Add story</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {columns.map((col) => (
            <section
              key={col.key}
              style={{ border: '1px solid #ddd', borderRadius: 10, minHeight: 360, padding: 12 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                const id = e.dataTransfer.getData('storyId')
                const story = stories.find((s) => s.id === id)
                if (story) await moveStory(story, col.key)
              }}
            >
              <h3>{col.title}</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {byStatus[col.key].map((story) => (
                  <article
                    key={story.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('storyId', story.id)}
                    onClick={() => setSelectedStory(story)}
                    style={{
                      border: '1px solid #ccc',
                      borderRadius: 8,
                      padding: 10,
                      background: selectedStory?.id === story.id ? '#f4f8ff' : 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <strong>{story.title}</strong>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                      {story.priority.toUpperCase()} {story.blocked ? '• BLOCKED' : ''}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <aside style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, minHeight: 360 }}>
          <h3>Story Details</h3>
          {!selectedStory ? (
            <p>Select a story</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Title</label>
              <input
                value={selectedStory.title}
                onChange={(e) => setSelectedStory({ ...selectedStory, title: e.target.value })}
              />

              <label>Description</label>
              <textarea
                value={selectedStory.description ?? ''}
                onChange={(e) => setSelectedStory({ ...selectedStory, description: e.target.value })}
                rows={3}
              />

              <label>Assignee</label>
              <input
                value={selectedStory.assignee ?? ''}
                onChange={(e) => setSelectedStory({ ...selectedStory, assignee: e.target.value })}
              />

              <label>Priority</label>
              <select
                value={selectedStory.priority}
                onChange={(e) => setSelectedStory({ ...selectedStory, priority: e.target.value as Priority })}
              >
                <option value="low">Low</option>
                <option value="med">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>

              <button onClick={saveStoryEdit}>Save Story</button>

              <hr />
              <h4>Dependencies</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <input placeholder="Depends on story ID" value={newDependencyId} onChange={(e) => setNewDependencyId(e.target.value)} />
                <button onClick={addDependency}>Add</button>
              </div>

              <h4>Notes</h4>
              <div style={{ display: 'grid', gap: 6, maxHeight: 120, overflow: 'auto' }}>
                {notes.map((n) => (
                  <div key={n.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{n.author}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
              </div>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} placeholder="Add note" />
              <button onClick={addNote}>Add Note</button>

              <hr />
              <h4>Context Files</h4>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={newFilename} onChange={(e) => setNewFilename(e.target.value)} placeholder="filename.ext" />
                <button onClick={addFile}>Attach</button>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                {files.map((f) => (
                  <div key={f.id} style={{ fontSize: 13 }}>• {f.filename}</div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <div style={{ marginTop: 16, border: '1px solid #ddd', borderRadius: 10, padding: 12 }}>
        <h3>Agent Activity</h3>
        {!agentSession ? (
          <p>No active session.</p>
        ) : (
          <>
            <div><strong>Now:</strong> {agentSession.title}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              State: {agentSession.state} • Last heartbeat: {new Date(agentSession.lastHeartbeatAt).toLocaleString()}
            </div>
            <div style={{ marginTop: 8, maxHeight: 160, overflow: 'auto', display: 'grid', gap: 6 }}>
              {agentEvents.map((e) => (
                <div key={e.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 8 }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{e.type.toUpperCase()} • {new Date(e.createdAt).toLocaleString()}</div>
                  <div>{e.message}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App
