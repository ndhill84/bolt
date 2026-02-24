# Bolt UI Redesign v2 — Trello-Style Dark Theme (Refined)

This v2 plan integrates the original redesign plus additional UX/performance/accessibility improvements.

## Product Intent
A sleek, compact, dark-mode sprint board for human + AI collaboration with strong visual status signals, minimal click-depth, and high throughput task management.

---

## What Changed from v1

1. Added **optional swimlane mode** (by assignee)
2. Added **WIP limits** + visual limit breach warnings
3. Added **accessibility-safe status signaling** (color + icon + text)
4. Added **card quick actions** to reduce drawer dependency
5. Added **inline dependency preview** on blocked cards
6. Added **saved filter presets**
7. Added **command palette** (`Cmd/Ctrl+K`)
8. Added **Agent dock pin modes** (pinned vs auto-collapse)
9. Added **performance guardrails** (virtualization threshold)
10. Added **microcopy style rules** for consistency

---

## UX Information Architecture

### Primary Views
1. **Board View (default)**
   - Top bar + filters + 3 columns
   - Compact story cards
   - Optional swimlanes toggle
2. **Story Drawer (right panel)**
   - Details, notes, dependencies, files
3. **Agent Dock (bottom)**
   - Collapsible or pinned activity panel
4. **Command Palette (global)**
   - Fast actions and story navigation

### Optional Board Modes
- **Mode A: Column-only** (default)
- **Mode B: Column + Swimlanes by Assignee**

---

## Visual & Interaction Additions

### 1) Swimlane Mode
- Toggle in top bar: `View: Standard | Swimlanes`
- In Swimlane mode, each column groups cards by assignee
- Unassigned lane pinned at top
- Keeps compact density; no card height increase

### 2) WIP Limits
- Per-column numeric limit setting (e.g., In Progress = 5)
- Header shows `In Progress (7/5)`
- If over limit:
  - Header count turns warning color
  - Small warning badge shown: `WIP EXCEEDED`
  - Optional subtle pulse animation (disabled for reduced motion)

### 3) Accessibility-Safe Status System
- Every status uses:
  - Color token
  - Icon (`clock`, `play`, `check`, `ban`)
  - Text label
- Priority badges also include text labels
- Ensure WCAG AA contrast for all text + badge combos

### 4) Card Quick Actions (hover)
- Appear on card hover right side:
  - Edit
  - Add note
  - Toggle blocked
  - Attach file
- Actions are icon buttons with tooltips
- Keyboard focusable for accessibility

### 5) Dependency Preview
- Blocked cards show one-line preview:
  - `Blocked by: #S12 Auth API`
- If multiple deps: `Blocked by #S12 +2 more`
- Clicking preview opens drawer dependency section

### 6) Filter Presets
- Presets as chips:
  - `My Work`
  - `Blocked`
  - `Urgent`
  - `Ready to Ship`
- Presets combine filters (status + assignee + priority)
- Saved in local storage per user

### 7) Command Palette
- Open via `Cmd/Ctrl+K`
- Commands:
  - New story
  - Go to story by ID
  - Move story to column
  - Toggle swimlanes
  - Toggle agent dock
  - Switch sprint
  - Apply filter preset

### 8) Agent Dock Modes
- Modes:
  - `Auto` (collapsed by default)
  - `Pinned` (always expanded)
- Dock state persisted in local storage
- Expanded mode includes:
  - Current state badge
  - Recent timeline events
  - Artifact chips (commits/PR/test logs)

### 9) Performance Guardrails
- If visible cards > 150, enable virtualization (react-window or equivalent)
- Debounced filter updates (100-150ms)
- Optimistic DnD updates with rollback on failure
- Memoized card rendering by ID + updatedAt

### 10) Microcopy Guidelines
- Voice: concise, direct, action-first
- No vague messages like "Something went wrong"
- Examples:
  - Good: `Story moved to In Progress.`
  - Good: `Move failed. Story returned to Waiting.`
  - Good: `Dependency added: #S12 blocks this story.`

---

## Revised Component Model

```
src/components/
  TopBar.tsx
  Board.tsx
  Column.tsx
  SwimlaneGroup.tsx          // new
  StoryCard.tsx
  StoryCardQuickActions.tsx  // new
  StoryDrawer.tsx
  AgentDock.tsx
  FilterBar.tsx
  FilterPresets.tsx          // new
  CommandPalette.tsx         // new
  WipBadge.tsx               // new
  StatusBadge.tsx
  PriorityBadge.tsx
```

---

## API/State Considerations for v2 UX

To support UI features cleanly:
- Story list endpoint should include compact fields:
  - `id,title,status,priority,blocked,assignee,updatedAt,noteCount,fileCount,dependencyCount,blockedByPreview`
- Add/confirm fields:
  - `noteCount`, `fileCount`, `dependencyCount`
  - `blockedByPreview` (single concise string)
- Add endpoint/option for WIP config (or local-only in v1.5)
- Keep all list payloads token-optimized and paginated

---

## Prioritized Delivery (P0 / P1 / P2)

### P0 (Must-have for first redesigned release)
1. Dark compact board visual redesign
2. Badge system (status, priority, blocked, counts)
3. Right slide drawer
4. Card quick actions
5. Filter presets
6. Agent dock pinned/auto modes
7. Accessibility-safe status signaling

### P1 (High-value next)
1. Swimlane mode toggle
2. WIP limit warnings
3. Dependency preview on cards
4. Command palette (`Cmd/Ctrl+K`)

### P2 (Scale + polish)
1. Virtualization threshold
2. Reduced-motion variants
3. Extra keyboard command coverage
4. Advanced presets + custom saved views

---

## Updated Acceptance Criteria

- [ ] Trello-like dark compact board implemented
- [ ] Card-level visual richness (badges, counts, blocked states)
- [ ] Drawer-based editing workflow with smooth transitions
- [ ] Quick actions on cards reduce click depth
- [ ] Filter presets + keyboard-friendly navigation
- [ ] Agent dock supports auto + pinned modes
- [ ] Color is never the sole status signal
- [ ] WIP limits and warnings (at least for In Progress)
- [ ] Board remains smooth with high card volume
- [ ] Microcopy is concise and action-oriented

---

## Recommended Next Step
Implement **P0 only** as the immediate build milestone so we can demo a polished Trello-like experience quickly, then layer P1/P2 incrementally.
