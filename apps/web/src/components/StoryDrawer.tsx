import type { DrawerSection, FileAsset, Note, Priority, Story, StoryDependency } from '../lib/types'

type Props = {
  open: boolean
  story: Story | null
  section: DrawerSection
  notes: Note[]
  dependencies: StoryDependency[]
  files: FileAsset[]
  newNote: string
  newDependencyId: string
  newFilename: string
  onClose: () => void
  onSectionChange: (section: DrawerSection) => void
  onStoryChange: (story: Story) => void
  isCreatingStory?: boolean
  onSaveStory: () => Promise<void>
  onNewNoteChange: (value: string) => void
  onNewDependencyIdChange: (value: string) => void
  onNewFilenameChange: (value: string) => void
  onAddNote: () => Promise<void>
  onAddDependency: () => Promise<void>
  onAddFile: () => Promise<void>
}

const sections: DrawerSection[] = ['details', 'notes', 'dependencies']

export function StoryDrawer({
  open,
  story,
  section,
  notes,
  dependencies,
  files,
  newNote,
  newDependencyId,
  newFilename,
  onClose,
  onSectionChange,
  onStoryChange,
  isCreatingStory,
  onSaveStory,
  onNewNoteChange,
  onNewDependencyIdChange,
  onNewFilenameChange,
  onAddNote,
  onAddDependency,
  onAddFile,
}: Props) {
  const activeSection: DrawerSection = section === 'files' ? 'details' : section

  return (
    <>
      {open && <button aria-label="Close drawer overlay" className="fixed inset-0 z-20 bg-black/40" onClick={onClose} />}
      <aside
        className="fixed right-0 top-0 z-30 h-full w-full max-w-xl border-l p-4 transition-transform duration-200"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-panel)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Story Drawer</h2>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Esc to close
          </button>
        </div>

        {!story ? (
          <p className="text-sm text-[var(--color-text-muted)]">Select a story to see details.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1">
              {sections.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className="rounded-md border px-2 py-1 text-xs font-semibold uppercase"
                  style={{
                    borderColor: activeSection === entry ? 'var(--color-accent)' : 'var(--color-border-soft)',
                    color: activeSection === entry ? 'var(--color-accent)' : 'var(--color-text-subtle)',
                    backgroundColor: activeSection === entry ? 'color-mix(in oklab, var(--color-accent) 16%, transparent)' : 'transparent',
                  }}
                  onClick={() => onSectionChange(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>

            {activeSection === 'details' && (
              <div className="grid gap-2">
                <label className="drawer-label">Title</label>
                <input
                  className="input-field"
                  value={story.title}
                  onChange={(event) => onStoryChange({ ...story, title: event.target.value })}
                />

                <label className="drawer-label">Description</label>
                <textarea
                  rows={5}
                  className="input-field"
                  value={story.description ?? ''}
                  onChange={(event) => onStoryChange({ ...story, description: event.target.value })}
                />

                <label className="drawer-label">Assignee</label>
                <input
                  className="input-field"
                  value={story.assignee ?? ''}
                  onChange={(event) => onStoryChange({ ...story, assignee: event.target.value })}
                />

                <label className="drawer-label">Priority</label>
                <select
                  className="input-field"
                  value={story.priority}
                  onChange={(event) => onStoryChange({ ...story, priority: event.target.value as Priority })}
                >
                  <option value="low">Low</option>
                  <option value="med">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>

                <label className="drawer-label">Files</label>
                <div className="max-h-40 overflow-auto pr-1">
                  <div className="grid gap-2">
                    {files.map((file) => (
                      <article
                        key={file.id}
                        className="rounded-lg border p-2 text-sm"
                        style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                      >
                        {file.filename}
                      </article>
                    ))}
                    {!files.length && <p className="text-xs text-[var(--color-text-muted)]">No files attached.</p>}
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    className="input-field"
                    placeholder="filename.ext"
                    value={newFilename}
                    onChange={(event) => onNewFilenameChange(event.target.value)}
                  />
                  <button type="button" className="ghost-btn" onClick={() => void onAddFile()}>
                    Attach
                  </button>
                </div>

                <button type="button" className="primary-btn" onClick={() => void onSaveStory()}>
                  {isCreatingStory ? 'Create Story' : 'Save Story'}
                </button>
              </div>
            )}

            {activeSection === 'notes' && (
              <div className="grid gap-2">
                <div className="max-h-56 overflow-auto pr-1">
                  <div className="grid gap-2">
                    {notes.map((note) => (
                      <article
                        key={note.id}
                        className="rounded-lg border p-2"
                        style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                      >
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {note.author} - {new Date(note.createdAt).toLocaleString()}
                        </p>
                        <p className="text-sm text-[var(--color-text)]">{note.body}</p>
                      </article>
                    ))}
                    {!notes.length && <p className="text-xs text-[var(--color-text-muted)]">No notes yet.</p>}
                  </div>
                </div>
                <textarea
                  rows={3}
                  className="input-field"
                  placeholder="Add a note"
                  value={newNote}
                  onChange={(event) => onNewNoteChange(event.target.value)}
                />
                <button type="button" className="primary-btn" onClick={() => void onAddNote()}>
                  Add Note
                </button>
              </div>
            )}

            {activeSection === 'dependencies' && (
              <div className="grid gap-2">
                <div className="max-h-56 overflow-auto pr-1">
                  <div className="grid gap-2">
                    {dependencies.map((dependency) => (
                      <article
                        key={dependency.id}
                        className="rounded-lg border p-2 text-sm"
                        style={{ borderColor: 'var(--color-border-soft)', backgroundColor: 'var(--color-surface)' }}
                      >
                        Blocked by story #{dependency.dependsOnStoryId}
                      </article>
                    ))}
                    {!dependencies.length && <p className="text-xs text-[var(--color-text-muted)]">No dependencies.</p>}
                  </div>
                </div>
                <input
                  className="input-field"
                  placeholder="Depends on story ID"
                  value={newDependencyId}
                  onChange={(event) => onNewDependencyIdChange(event.target.value)}
                />
                <button type="button" className="primary-btn" onClick={() => void onAddDependency()}>
                  Add Dependency
                </button>
              </div>
            )}

          </>
        )}
      </aside>
    </>
  )
}
