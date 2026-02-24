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
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    loadStories().catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedStory) return
    loadNotes(selectedStory.id).catch(console.error)
  }, [selectedStory?.id])

  async function createStory() {
    if (!newTitle.trim()) return
    setLoading(true)
    try {
      await fetch(`${API}/stories`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: newTitle, status: 'waiting', priority: 'med' }),
      })
      setNewTitle('')
      await loadStories()
    } finally {
      setLoading(false)
    }
  }

  async function moveStory(story: Story, status: StoryStatus) {
    if (story.status === status) return
    await fetch(`${API}/stories/${story.id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    await loadStories()
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
      <p>Build mode active. Core board workflow is now live.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          placeholder="New story title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          style={{ padding: 8, minWidth: 300 }}
        />
        <button onClick={createStory} disabled={loading}>Add story</button>
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
                rows={4}
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
              <h4>Notes</h4>
              <div style={{ display: 'grid', gap: 6, maxHeight: 150, overflow: 'auto' }}>
                {notes.map((n) => (
                  <div key={n.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{n.author}</div>
                    <div>{n.body}</div>
                  </div>
                ))}
              </div>
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3} placeholder="Add note" />
              <button onClick={addNote}>Add Note</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default App
