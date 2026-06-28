# Editing photos

Titles and commentary are set at upload time (see [Adding photos](./adding-photos.md)),
but you don't have to re-upload a file to fix a typo or rewrite a note. While
[signed in](./admin-sign-in.md), the **admin photo table** at **`/admin/photos`**
lists every photo and lets you edit its **title** and **commentary** inline, with
changes saved automatically. It also supports a CSV round-trip for bulk edits.

> You must be **signed in** first. See [Admin sign-in](./admin-sign-in.md).
> The table is reachable from the **Manage photos** link in the admin strip on
> album pages, or by going straight to `/admin/photos`.

## The table

Each photo is one row, ordered newest first. The columns are:

| Column       | Editable | Notes                                                       |
| ------------ | -------- | ----------------------------------------------------------- |
| `#`          | no       | Row number of the **current (filtered)** view; restarts at 1. |
| ID           | no       | Photo id. A link — opens the photo in the gallery in a new tab. |
| Image        | no       | Thumbnail (lowest-res derivative).                          |
| Album        | no       | Album name. A link — opens the album page in a new tab.     |
| **Title**    | **yes**  | Single-line text.                                           |
| **Commentary** | **yes** | Multi-line text.                                            |
| EXIF         | no       | Read-only capture summary (ƒ-stop · shutter · ISO · focal). |

The ID link opens `/albums/<slug>#photo-<id>`, which deep-links straight to that
photo in the album's full-screen viewer. Both links open in a new tab.

The page is keyboard accessible: editable cells are reachable by **Tab** with a
visible focus ring, and editing works without a mouse. On narrow screens the table
collapses to stacked cards — read-only fields become labels, Title and Commentary
stay editable.

## Inline editing & auto-save

Type directly into a Title or Commentary cell. Edits live in an in-memory model,
so **filtering or paging never loses an unsaved change**.

Saving is automatic:

- Changed (dirty) rows are flushed every **15 seconds**.
- A row is also saved the moment its field **loses focus** — you don't have to
  wait for the timer.
- If nothing has changed, no request is made.
- Leaving the page with unsaved edits attempts a best-effort final save and warns
  you before you navigate away.

Each save sends `PATCH /admin/photos/<id>` (authorized by the `admin_session`
cookie). The status line at the bottom shows progress — e.g. *"Saved 3s ago · 1
pending"*, or *"All saved"* when everything is clean.

### Validation

The same rules as ingest apply, server-side and parameterized (SQL-injection
safe):

- **Title** is trimmed and must be **non-empty**. Clearing a title shows an inline
  error and the row is **not** saved (it stays dirty so you can fix it).
- **Commentary** is trimmed; an **empty** commentary is stored as `null`.

## Filtering

The **Filter…** box narrows the table client-side, matching against id, album,
title, and commentary. The `#` column renumbers the visible rows from 1. Edit a
row, filter it out of view and back, and the edit is still there.

## Pagination

The full library is paged at **50 rows** per page, with prev/next controls. All
edits are held in the model, so they survive paging.

## Bulk edits: download & upload

For large rewrites, round-trip the data through a spreadsheet.

### Download

The **Download** button produces a **`photos.zip`** containing:

- **`photos.csv`** — columns `id`, `path`, `title`, `comment`. Fields are properly
  quoted, so commas, quotes, and newlines in your text survive intact.
- An **`images/`** folder with the lowest-res JPEG of each photo, named
  `images/<id>.jpg` (the same relative `path` written in the CSV) so you can see
  what you're editing.

The export reflects **saved** server data. If any rows are still dirty, they're
flushed first so the ZIP is up to date.

### Upload

Edit `photos.csv` locally, then use the **Upload** button to send it back. Each
row is matched **by `id`** (the `path` column is informational only) and its title
and commentary are updated with the same validation as inline editing.

The import is **partial-success**: unknown ids and invalid rows are reported but
never abort the run. Afterwards a summary shows the counts — e.g.
*"12 updated · 1 not found · 0 error"* — with a line per failed row, and the table
refreshes to show the new values.

> Keep the header row exactly `id,path,title,comment`. A different or missing
> header is rejected with a 400 so a wrong file can't be applied by accident.

## Endpoints

All four share the `admin_session` cookie auth ([Admin sign-in](./admin-sign-in.md)).
The page route redirects unauthenticated visitors to the login; the API routes
return **401**.

| Endpoint                        | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `GET /admin/photos`             | Render the table page.                               |
| `PATCH /admin/photos/:photoId`  | Update one photo's `title`/`commentary` (auto-save). |
| `GET /admin/photos/export`      | Download the `photos.zip` (CSV + images).            |
| `POST /admin/photos/import`     | Apply a CSV of bulk edits; returns a per-row summary. |

No schema changes are involved — editing reuses the existing `title` and
`commentary` columns.
