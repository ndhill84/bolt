# UI/UX Plan

## Primary Screens
1. **Sprint Board**
   - 3 columns: Waiting / In Progress / Completed
   - Card quick info + blocked badge
   - Filters and sprint selector
2. **Story Drawer**
   - Full edit form
   - Notes stream
   - Dependencies tab
   - Files tab
3. **Context Library**
   - Project-level files and linked stories
4. **Agent Activity**
   - Now panel
   - Timeline
   - Sessions list
   - Artifacts/evidence panel
5. **Decision Log + Action Items**
   - Searchable history + execution queue

## Interaction Notes
- Drag/drop updates story status optimistically.
- Detail fetched lazily on story click (token and bandwidth friendly).
- Timeline auto-refresh every 10–20s with delta sync.
