import type { AgentEvent, AgentSession, DockMode } from '../lib/types'

type Props = {
  mode: DockMode
  expanded: boolean
  session: AgentSession | null
  events: AgentEvent[]
  onToggleMode: () => void
  onToggleExpanded: () => void
}

export function AgentDock({ mode, expanded, session, events, onToggleMode, onToggleExpanded }: Props) {
  const canCollapse = mode === 'auto'
  return (
    <section
      className="fixed bottom-3 left-3 right-3 z-10 rounded-2xl border p-3"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Agent Dock</h3>
          <p className="text-xs text-[var(--color-text-muted)]">Mode: {mode === 'pinned' ? 'Pinned' : 'Auto'} (A)</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="ghost-btn" onClick={onToggleMode}>
            Toggle Mode
          </button>
          <button type="button" className="ghost-btn" onClick={onToggleExpanded} disabled={!canCollapse}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-2">
          {!session ? (
            <p className="text-sm text-[var(--color-text-muted)]">No active session.</p>
          ) : (
            <>
              <div className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Current State</p>
                <p className="text-sm text-[var(--color-text)]">{session.title}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {session.state} - heartbeat {new Date(session.lastHeartbeatAt).toLocaleString()}
                </p>
              </div>
              <div className="max-h-36 overflow-auto pr-1">
                <div className="grid gap-2">
                  {events.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-lg border px-3 py-2"
                      style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                    >
                      <p className="text-[11px] uppercase text-[var(--color-text-muted)]">
                        {event.type} - {new Date(event.createdAt).toLocaleString()}
                      </p>
                      <p className="text-sm text-[var(--color-text)]">{event.message}</p>
                    </article>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
