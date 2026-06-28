# Edit Photo Content — Admin Photo Table

## Context

The admin UI currently supports only one action on a photo: delete. Title and
commentary are set once at upload time via the iOS Shortcut ingest endpoint, but
there is no way to correct or update them afterwards without re-uploading the
file.

This PRD captures the requirements for a dedicated **admin photo table** page:
a single screen that lists every photo in a filterable table, lets the admin
edit the title and commentary inline, and supports a CSV-based round-trip
(download → edit locally → upload) for bulk edits. Inline edits are persisted
with periodic auto-save.

## Functional requirements

### 1. Admin photo table page

- A new admin-only page (e.g. `/admin/photos`) renders a table of all photos.
- The page is protected by the existing admin session cookie (same auth as
  `DELETE /admin/photos/:photoId`). Unauthenticated requests are redirected to
  the admin login / rejected with 401.
- Columns, in order:

  | # | Column     | Editable | Notes |
  |---|------------|----------|-------|
  | 0 | Row number | no       | 1-based ordinal of the current (filtered) view |
  | 1 | ID         | no       | Photo id |
  | 2 | Image      | no       | Thumbnail (lowest-res derivative) |
  | 3 | Album      | no       | Album name the photo belongs to |
  | 4 | Title      | **yes**  | Single-line text |
  | 5 | Commentary | **yes**  | Multi-line text |
  | 6 | EXIF       | no       | Read-only EXIF summary |

- Read-only columns are not editable in any way.
- **Clickable links:** the ID and Album cells are links that open the
  corresponding pages in a **new tab** (`target="_blank"`, with
  `rel="noopener noreferrer"`):
  - ID links to the photo's page (full preview version).
  - Album links to the album's page.
- The page must be keyboard accessible: editable cells are reachable by Tab,
  visible focus is shown, and editing is possible without a mouse.

### 2. Filtering

- The table can be filtered client-side by a free-text query.
- Filtering matches against (at minimum) ID, album, title, and commentary.
- The row-number column (#0) reflects the **filtered** view: numbering restarts
  at 1 for the visible rows.
- Filtering must not lose unsaved edits in rows that scroll out of the filtered
  view.

### 3. Inline editing + auto-save

- Title and commentary are editable directly in the table cells.
- Editing rules (mirrors the ingest validation):
  - Title must be a non-empty string after trimming.
  - Commentary must be a string or null.
  - Leading/trailing whitespace is trimmed from both fields before saving.
  - An empty commentary is saved as `null`. An empty title is invalid (the
    cell shows an inline error and is not saved).
  - Values are parameterized/escaped on the server to prevent SQL injection.
- **Auto-save:** while there is edit activity, changed rows are auto-saved
  every **15 seconds**. Concretely:
  - A debounce/interval timer flushes pending (dirty) edits every 15 s.
  - If there are no dirty rows, no save request is made.
  - On `beforeunload`/navigation away with unsaved dirty rows, attempt a final
    flush (best-effort) and/or warn the user.
- **Save feedback:** each row indicates its state — clean, dirty (pending),
  saving, saved, or error. Errors are shown inline on the affected row and the
  row stays dirty so the edit is retried on the next flush.

### 4. CSV + images export (download)

- A "Download" action produces a single **ZIP** file containing:
  - `photos.csv` with columns: `id`, `path` (relative path to the image),
    `title`, `comment`.
    - `path` is the relative path to the lowest-resolution derivative for that
      photo.
    - CSV is properly escaped/quoted (handles commas, quotes, and newlines in
      title/commentary).
  - An `images/` directory containing the **lowest-resolution derivative** for
    each photo, referenced by the same relative `path` used in the CSV.
- The export reflects the current data on the server (saved values), not
  unsaved in-progress edits. If there are dirty rows, prompt to save first (or
  auto-flush before exporting).

### 5. CSV upload (bulk update)

- An "Upload" action accepts a `photos.csv` file (same column shape as the
  export: `id`, `path`, `title`, `comment`).
- For each row matched by `id`, update the photo's `title` and `commentary`:
  - Same validation/sanitization rules as inline editing (trim, non-empty
    title, empty comment → null, SQL-injection-safe).
  - `path` is informational only; matching is by `id`.
  - Rows with an unknown `id` are reported as errors but do not abort the whole
    upload (partial success); a per-row result summary is shown.
- After a successful upload, the table refreshes to show the updated values.

### 6. API endpoints

- `GET /admin/photos` — render the table page (HTML, SSR).
- `PATCH /admin/photos/:photoId` — partial update of a single photo.
  - JSON body: `{ title?: string | null, commentary?: string | null }`.
  - Only supplied fields are updated (partial update semantics).
  - Returns the updated photo object on success (200); 404 if not found, 401 if
    unauthenticated.
  - Used by inline auto-save. A batch variant may be used to flush multiple
    dirty rows in one request (optional optimization).
- `GET /admin/photos/export` — returns the ZIP (CSV + images) described above.
- `POST /admin/photos/import` — accepts the uploaded CSV and applies bulk
  updates; returns a per-row result summary.
- All endpoints share the existing admin session auth.

### 7. No new schema fields

- The feature uses the existing `title` and `commentary` columns; no migration
  is required.

## Non-functional requirements

- Match the existing minimalist black-and-white gallery aesthetic: no new design
  tokens; style the table within the existing system. The interface stays out of
  the way; the photos remain the hero.
- Accessible: keyboard navigable, visible focus, proper `<label>`/header
  associations for editable cells, meaningful `alt` text on thumbnails.
- Honor `prefers-reduced-motion` (no transition animations if reduced motion is
  preferred).
- Performance: the table should remain usable with a large number of photos
  (consider virtualization or pagination if needed); thumbnails use the
  lowest-res derivative to keep payload small.
- Auto-save must not spam the server: only dirty rows are sent, batched per the
  15 s interval.

## Layout

### Desktop / Landscape Tablet

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ← Admin · Photos                          [ Filter… ]  [Download] [Upload]  │
│  ──────────────────────────────────────────────────────────────────────────  │
│  #  │ ID    │ Image │ Album    │ Title            │ Commentary        │ EXIF  │
│  ── │ ───── │ ───── │ ──────── │ ──────────────── │ ───────────────── │ ───── │
│  1  │ a1b2  │ [img] │ Mountains│ [Summer in the…] │ [A quiet after…]  │ ƒ/8…  │
│  2  │ c3d4  │ [img] │ City     │ [Night lights ]  │ [Long exposure…]  │ ƒ/2…  │
│  3  │ e5f6  │ [img] │ Coast    │ [Low tide     ]  │ [               ]  │ ƒ/11… │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Saved 3s ago · 1 row pending                                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

- Editable cells (Title, Commentary) render as inline inputs/textareas.
- Top bar holds the filter box and Download / Upload actions.
- A status line shows last-saved time and pending-edit count.

### Mobile

```
┌──────────────────────────────┐
│  ← Admin · Photos            │
│  [ Filter… ]                 │
│  [Download]      [Upload]    │
│  ──────────────────────────  │
│  #1 · a1b2 · Mountains       │
│  [img]                       │
│  Title                       │
│  ┌────────────────────────┐  │
│  │ Summer in the…         │  │
│  └────────────────────────┘  │
│  Commentary                  │
│  ┌────────────────────────┐  │
│  │ A quiet afternoon…     │  │
│  └────────────────────────┘  │
│  EXIF: ƒ/8 · 1/250 · ISO100  │
│  ──────────────────────────  │
│  #2 · c3d4 · City            │
│  …                           │
│  ──────────────────────────  │
│  Saved 3s ago · 1 row pending│
└──────────────────────────────┘
```

- On narrow screens the table collapses to stacked cards: read-only fields are
  shown as labels, Title and Commentary remain editable inputs.
