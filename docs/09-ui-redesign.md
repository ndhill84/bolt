# Bolt UI Redesign — Trello-Style Dark Theme

## Design Direction
**Inspiration:** Linear + Trello hybrid  
**Theme:** Dark-first  
**Density:** Compact cards, maximum board visibility  
**Visual language:** Badges, status dots, color-coded priority, subtle glow for active states  

---

## Design Tokens

### Colors (Dark Theme)

```
/* Surfaces */
--bg-base:        #0B1020    /* deep navy, matches logo */
--bg-surface:     #131A2E    /* card/panel background */
--bg-surface-alt: #1A2340    /* hover/elevated surface */
--bg-column:      #0F1628    /* column background */
--border:         #1E2A45    /* subtle borders */
--border-active:  #3B5BDB    /* focus/selected border */

/* Text */
--text-primary:   #E2E8F0    /* slate-200 */
--text-secondary: #94A3B8    /* slate-400 */
--text-muted:     #64748B    /* slate-500 */

/* Brand */
--accent:         #FACC15    /* bolt yellow (from logo) */
--accent-hover:   #EAB308

/* Semantic / Badge Colors */
--status-waiting:    #64748B  /* slate-500, neutral */
--status-progress:   #3B82F6  /* blue-500 */
--status-completed:  #10B981  /* emerald-500 */
--status-blocked:    #EF4444  /* red-500 */

--priority-low:      #64748B  /* slate-500 */
--priority-med:      #F59E0B  /* amber-500 */
--priority-high:     #F97316  /* orange-500 */
--priority-urgent:   #EF4444  /* red-500 */

/* Agent State */
--agent-planning:    #8B5CF6  /* violet-500 */
--agent-coding:      #3B82F6  /* blue-500 */
--agent-testing:     #06B6D4  /* cyan-500 */
--agent-blocked:     #EF4444  /* red-500 */
--agent-done:        #10B981  /* emerald-500 */
```

### Typography
```
--font-family:    'Inter', system-ui, -apple-system, sans-serif
--font-mono:      'JetBrains Mono', 'Fira Code', monospace

/* Scale */
--text-xs:   0.75rem / 1rem
--text-sm:   0.8125rem / 1.25rem
--text-base: 0.875rem / 1.375rem   /* default body is 14px */
--text-lg:   1rem / 1.5rem
--text-xl:   1.25rem / 1.75rem

/* Weights */
--font-normal:   400
--font-medium:   500
--font-semibold: 600
--font-bold:     700
```

### Spacing Scale
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-6: 24px
--space-8: 32px
```

### Radius & Shadows
```
--radius-sm: 4px    /* badges, small elements */
--radius-md: 8px    /* cards */
--radius-lg: 12px   /* panels, modals */

--shadow-card:  0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)
--shadow-hover: 0 4px 12px rgba(0,0,0,0.4)
--shadow-drawer: -4px 0 24px rgba(0,0,0,0.5)
```

---

## Layout Architecture

```
┌──────────────────────────────────────────────────────────┐
│  TOP BAR                                                  │
│  [⚡ Bolt]  [Sprint: Sprint 1 ▼]  [Filters]    [👤 You]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────┐  ┌─────────────┐  ┌───────────┐            │
│  │ WAITING  │  │ IN PROGRESS │  │ COMPLETED │            │
│  │ (4)      │  │ (3)         │  │ (12)      │            │
│  │          │  │             │  │           │            │
│  │ ┌──────┐ │  │ ┌─────────┐ │  │ ┌───────┐ │            │
│  │ │ Card │ │  │ │  Card   │ │  │ │ Card  │ │            │
│  │ └──────┘ │  │ └─────────┘ │  │ └───────┘ │            │
│  │ ┌──────┐ │  │ ┌─────────┐ │  │ ┌───────┐ │            │
│  │ │ Card │ │  │ │  Card   │ │  │ │ Card  │ │            │
│  │ └──────┘ │  │ └─────────┘ │  │ └───────┘ │            │
│  └─────────┘  └─────────────┘  └───────────┘            │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  AGENT DOCK (collapsible)                                │
│  [🟢 Coding] Build Bolt milestones · 14m  [▲ expand]    │
└──────────────────────────────────────────────────────────┘
```

**When story is selected → right drawer slides in:**

```
┌──────────────────────────────────────┬───────────────────┐
│          BOARD (shrinks)             │   STORY DRAWER    │
│                                      │   [Title]         │
│                                      │   [Status badge]  │
│                                      │   [Priority]      │
│                                      │   [Assignee]      │
│                                      │   ─────────────── │
│                                      │   [Description]   │
│                                      │   [Acceptance]    │
│                                      │   ─────────────── │
│                                      │   [Dependencies]  │
│                                      │   [Notes]         │
│                                      │   [Files]         │
│                                      │   ─────────────── │
│                                      │   [Save] [Close]  │
└──────────────────────────────────────┴───────────────────┘
```

---

## Component Specs

### Story Card (compact)

```
┌─────────────────────────────────┐
│ ● Auth refresh bug          [!] │  ← priority dot + blocked icon
│ #s42  ·  🔴 HIGH  ·  Claudio   │  ← ID + priority badge + assignee
│ 📎2  💬3  🔗1                   │  ← file count, note count, dep count
└─────────────────────────────────┘
```

**Card rules:**
- Height: ~64-72px (compact)
- Left border: 3px colored by status (waiting=slate, progress=blue, done=green)
- Blocked cards: subtle red glow border + 🚫 icon
- Drag handle on hover (left edge)
- Click → opens drawer
- Priority badge: colored pill (LOW=slate, MED=amber, HIGH=orange, URGENT=red)
- Assignee: avatar circle or initials badge
- Bottom row: icon + count badges for attachments, notes, dependencies

### Column Header

```
┌─────────────────────────────────┐
│  ● IN PROGRESS          (3)    │  ← status dot + count
│  [+ Add story]                  │
└─────────────────────────────────┘
```

- Status dot matches column color
- Story count in muted text
- "+ Add story" button at top of column (ghost style)
- Column background slightly darker than base

### Top Bar
- Logo (⚡ Bolt) left-aligned
- Sprint selector dropdown
- Filter chips: status, assignee, priority, blocked-only
- User avatar / settings right-aligned
- Height: 48px, border-bottom subtle

### Story Drawer (right slide)
- Width: 420px
- Sections with collapsible headers:
  1. **Header**: title (editable inline), status badge, priority selector
  2. **Details**: description textarea, acceptance criteria textarea, assignee, points, due date
  3. **Dependencies**: list with "blocked by" links, add button
  4. **Notes**: reverse-chronological feed, add note input
  5. **Files**: attachment list with upload button, filename + size + uploader
- Footer: Save button (accent yellow), Close (X top-right)
- Backdrop: semi-transparent overlay on board

### Agent Activity Dock (bottom)
- **Collapsed (default):** single 40px bar at bottom
  - Status dot (color by state) + session title + elapsed time + expand chevron
- **Expanded:** slides up to ~200px
  - Timeline of recent events (type badge + message + timestamp)
  - Current task detail
  - Evidence links (commits/PRs) as clickable chips

### Badges

| Badge | Style | Example |
|-------|-------|---------|
| Priority | Colored pill, uppercase, text-xs | `🔴 URGENT` `🟠 HIGH` `🟡 MED` `⚪ LOW` |
| Status | Dot + label | `🔵 In Progress` `🟢 Completed` `⚫ Waiting` |
| Blocked | Red outline pill with icon | `🚫 BLOCKED` |
| Assignee | Circle with initials or emoji | `[C]` for Claudio, `[Y]` for You |
| Count | Muted icon + number | `📎 2` `💬 5` `🔗 1` |
| Agent state | Glowing dot + label | `🟣 Planning` `🔵 Coding` `🔴 Blocked` |

---

## Interaction Rules

1. **Drag/drop** between columns updates status optimistically (instant visual move, API call in background, rollback on failure)
2. **Click card** → drawer slides in from right (300ms ease-out)
3. **Escape or click backdrop** → drawer closes
4. **Inline edit** story title by clicking it in the drawer
5. **Add story** via column header button → creates card at top of Waiting column with title input focused
6. **Agent dock** click expands/collapses with smooth transition
7. **Filter chips** toggle on/off, multiple active filters AND together
8. **Keyboard shortcuts**:
   - `N` — new story
   - `Esc` — close drawer
   - `F` — toggle filters
   - `A` — toggle agent dock

---

## States to Cover

- **Empty column**: "No stories yet" + ghost add button
- **Empty board**: Onboarding prompt ("Create your first story")
- **Loading**: Skeleton cards (3 per column, pulsing)
- **Error**: Toast notification (red, top-right, auto-dismiss 5s)
- **Drag active**: Card lifts with shadow, drop zone highlights
- **Blocked story**: Red left border + glow, blocked badge visible
- **Agent idle**: Dock shows "No active session" in muted text

---

## Tech Implementation Plan

1. **Add Tailwind CSS** to `apps/web` (with dark mode config)
2. **Install dependencies**: `@dnd-kit/core` + `@dnd-kit/sortable` (for proper drag/drop)
3. **Component structure**:
   ```
   src/
   ├── components/
   │   ├── TopBar.tsx
   │   ├── Board.tsx
   │   ├── Column.tsx
   │   ├── StoryCard.tsx
   │   ├── StoryDrawer.tsx
   │   ├── AgentDock.tsx
   │   ├── Badge.tsx
   │   ├── FilterBar.tsx
   │   └── ui/          (shared primitives)
   │       ├── Button.tsx
   │       ├── Input.tsx
   │       ├── Select.tsx
   │       └── Pill.tsx
   ├── hooks/
   │   ├── useStories.ts
   │   ├── useAgent.ts
   │   └── useFiles.ts
   ├── styles/
   │   └── tokens.css   (CSS custom properties)
   ├── App.tsx
   └── main.tsx
   ```
4. **Build order**:
   - Phase A: tokens.css + Tailwind config + TopBar + Board + Column + StoryCard
   - Phase B: StoryDrawer + Badge system + drag/drop
   - Phase C: AgentDock + FilterBar + keyboard shortcuts
   - Phase D: Loading/empty/error states + polish + transitions

---

## Acceptance Criteria

- [ ] Dark theme with token-based color system
- [ ] Compact cards with priority/status/assignee badges
- [ ] 3-column Trello-style board with drag/drop
- [ ] Right slide drawer for story details (notes, deps, files)
- [ ] Collapsible agent activity dock at bottom
- [ ] Filter bar (status, assignee, priority, blocked)
- [ ] Loading skeletons, empty states, error toasts
- [ ] Keyboard shortcuts (N, Esc, F, A)
- [ ] Responsive (works at 1024px+ minimum)
