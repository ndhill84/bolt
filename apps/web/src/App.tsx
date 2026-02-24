import './App.css'

const columns = [
  { key: 'waiting', title: 'Waiting' },
  { key: 'in_progress', title: 'In Progress' },
  { key: 'completed', title: 'Completed' }
]

function App() {
  return (
    <div style={{ padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h1>Bolt — Sprint Board</h1>
      <p>Planning + architecture complete. Build started.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 20 }}>
        {columns.map((c) => (
          <section key={c.key} style={{ border: '1px solid #ddd', borderRadius: 10, minHeight: 280, padding: 12 }}>
            <h3>{c.title}</h3>
          </section>
        ))}
      </div>
    </div>
  )
}

export default App
