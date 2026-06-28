# Edit Photo Content

## Context

The admin UI currently supports only one action on a photo: delete. Title and
commentary are set once at upload time via the iOS Shortcut ingest endpoint, but
there is no way to correct or update them afterwards without re-uploading the
file. This PRD captures the requirements for an in-browser edit flow for those
two user-supplied fields.

## Functional requirements

1. **Context menu action** — Add "Edit photo" as a second action in the admin
   context menu (after "Delete photo"). The menu is triggered by a long-press
   (≥ 600 ms) or right-click on any `[data-admin-photo]` figure while an admin
   session is active.

2. **Edit Photo Page** — Selecting "Edit photo" opens a new page with an edit form:
   - A single-line text input for **title**, pre-filled with the photo's current
     title (or empty if null).
   - A multi-line textarea for **commentary**, pre-filled with the current value.
   - **Save** and **Cancel** buttons. Cancel dismisses without changes.
   - Submitting an empty field saves `null` (clears the value).
   - The page must be keyboard accessible: focus lands on the title input when
     it opens; Tab cycles through inputs and buttons; Escape cancels and go back to previous page; CMD+S saves.
   - Validation & sanitization: the title must be a non-empty string, the commentary must be a string (or null). Make sure there are no leading/trailing spaces in the title and commentary. 
   - Sanitize to prevent SQL injection.

3. **API endpoint** — `PATCH /admin/photos/:photoId`
   - Protected by the existing session cookie (same auth as `DELETE /admin/photos/:photoId`).
   - JSON body: `{ title?: string | null, commentary?: string | null }`.
   - Only supplied fields are updated (partial update semantics).
   - Returns the updated photo object on success (200).
   - Returns 404 if the photo does not exist, 401 if unauthenticated.

4. **UI feedback**
   - On success: close the page and go back to the previous page & refresh the data.
   - On failure: show an inline error message inside the page; keep the page open so the user can retry or cancel.

5. **No new schema fields** — The feature uses the existing `title` and
   `commentary` columns; no migration is required.

## Non-functional requirements

- Match the existing minimalist aesthetic: no new design tokens; use the same B&W gallery style but for form.
- Accessible: visible focus, proper `<label>` associations.
- Honor `prefers-reduced-motion` (no transition animation if reduced motion is
  preferred).
- Honor the request desktop version, check user agent to determine if the request is for desktop/tablet or mobile.


## Layout

### Desktop/Landscape Tablet

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ← Edit Photo                                                   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Title                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ "Summer in the mountains"                          ↵    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Commentary                                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ A quiet afternoon, golden hour light filtering through  │    │ 
│  │ the pine trees. Shot on Portra 400. The calm before the │    │
│  │ storm.                                                  │    │
│  │                                                         │    │
│  │                                                         │    │
│  │                                                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  [Cancel]                                          [Save]       │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Error (if needed):                                             │
│  Title cannot be empty.                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Two-column layout on large screens (photo preview on right):

```
┌──────────────────────┬──────────────────────────┐
│ ← Edit Photo         │ Photo thumbnail (100px)  │
├──────────────────────┼──────────────────────────┤
│ Title input          │                          │
│ Commentary textarea  │ (Shows which photo we're │
│ Error area           │  editing)                │
│ [Cancel] [Save]      │                          │
└──────────────────────┴──────────────────────────┘
```

### Mobile

```
┌──────────────────────────────┐
│                              │
│  ← Edit Photo                │
│                              │
│  ──────────────────────────  │
│                              │
│  Title                       │
│  ┌────────────────────────┐  │
│  │ "Summer in the…"   ↵   │  │
│  └────────────────────────┘  │
│                              │
│  Commentary                  │
│  ┌────────────────────────┐  │
│  │ A quiet afternoon,     │  │
│  │ golden hour light      │  │
│  │ filtering through…     │  │
│  │                        │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│  [Cancel]       [Save]       │
│                              │
│  ──────────────────────────  │
│                              │
│  Error (if needed):          │
│  Title cannot be empty.      │
│                              │
└──────────────────────────────┘
```
