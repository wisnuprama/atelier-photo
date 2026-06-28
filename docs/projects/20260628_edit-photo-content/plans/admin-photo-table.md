# Implementation Plan — Admin Photo Table (Edit Photo Content)

## Implementation Checklist

> Update each box to `[x]` once that phase is implemented and its checks pass.

Each phase ships with its own tests (see **Tests per phase** below); a phase
is only `[x]` when its code **and** its tests are green.

- [x] **Phase 0 — Deps & scaffolding:** add `jszip` (+ types) to `package.json`;
      confirm ESM import.
- [x] **Phase 1 — Server data layer:** `listAllPhotos`, `updatePhoto`,
      `normalizePhotoFields` in `src/server/services/photos.ts`.
  - [x] Tests: extend `src/server/services/photos.test.ts`.
- [x] **Phase 2 — CSV utility:** `toCsv`/`parseCsv` in
      `src/server/services/csv.ts`.
  - [x] Tests: new `src/server/services/csv.test.ts` (unit, round-trip).
- [x] **Phase 3 — Routes:** `GET /photos`, `PATCH /photos/:id`,
      `GET /photos/export`, `POST /photos/import` in `src/server/routes/auth.ts`.
  - [x] Tests: new `src/server/routes/auth.test.ts` (critical paths via
        `app.inject`).
- [x] **Phase 4 — Table view:** `src/server/views/admin-photos.ts` (table +
      mobile cards + JSON island).
  - [x] Tests: new `src/server/views/admin-photos.test.ts` (render/escaping).
- [ ] **Phase 5 — Client table logic:** `src/client/ts/admin-photos.ts`
      (model, filter, pagination, inline edit, auto-save, export/import);
      register in `main.ts`.
  - [ ] Tests: pure model/filter/pagination helpers unit-tested in
        `src/client/ts/admin-photos.test.ts`.
- [x] **Phase 6 — Deep-linking:** `#photo-{id}` support in
      `src/client/ts/viewer.ts`; figure ids + "Manage photos" link in
      `src/server/views/showcase.ts`.
  - [x] Tests: hash→index resolver helper unit-tested.
- [ ] **Phase 7 — Verify:** `pnpm typecheck && pnpm lint && pnpm test` green +
      manual end-to-end checks.

## Context

Today the only admin action on a photo is **delete** (`DELETE /admin/photos/:photoId`
in `src/server/routes/auth.ts`). Title and commentary are set once at upload time
via the HMAC-protected iOS Shortcut ingest endpoint (`POST /admin/photos` in
`src/server/routes/admin.ts`) and there is no way to correct them afterward
without re-uploading the original file.

This adds a dedicated, session-protected **admin photo table** at `/admin/photos`
that lists every photo, lets the admin edit title/commentary inline with 15s
auto-save, and supports a CSV+images ZIP round-trip (download → edit → upload)
for bulk edits. No schema changes — it reuses the existing `title` and
`commentary` columns.

Requirements: `docs/projects/20260628_edit-photo-content/requirements.md`.

### Decisions (confirmed with user)

- **ZIP export:** add a minimal dependency (`jszip`) — generate the archive
  in-memory as a Node Buffer. (Departs from the usual "no new deps" preference,
  but hand-rolling a ZIP writer was judged not worth it.)
- **CSV:** use **PapaParse** rather than a hand-rolled RFC-4180 parser — same
  rationale (a proper, well-tested library over bespoke parsing).
- **ID link target:** `/albums/{slug}#photo-{id}` — requires adding **hash
  deep-linking** to the lightbox in `src/client/ts/viewer.ts`. Album cell links
  to `/albums/{slug}` (no hash). Both open in a new tab.
- **Scaling:** client-side **pagination** over a client-held data model
  (page size ~50). The full dataset is shipped as a JSON island; edits live in
  the model (not the DOM), so they survive paging and filtering.

## Architecture notes (from exploration)

- `authRoutes` (session cookie auth, `src/server/routes/auth.ts`) and
  `adminRoutes` (HMAC, `src/server/routes/admin.ts`) are **separate plugin
  scopes** both mounted under `/admin` in `src/server/app.ts`. Content-type
  parsers and hooks are encapsulated per scope, so new session-protected routes
  go in `authRoutes` and will **not** trigger the HMAC `preValidation` hook. New
  paths (`GET /photos`, `PATCH /photos/:id`, `GET /photos/export`,
  `POST /photos/import`) don't collide with adminRoutes' `POST /photos`.
- Auth guard: `getAdminSession(request): boolean` (`src/server/plugins/session.ts`).
- SSR is template-literal views wrapped by `layout()` (`src/server/views/layout.ts`);
  escape interpolations with `esc()` and embed JSON islands with `jsonScript()`
  (`src/server/views/util.ts`). Media URLs via `mediaUrl(id, "thumb"|"full")`.
- Client TS lives in `src/client/ts/`, bundled by `scripts/esbuild.js` from
  `main.ts` → `public/js/app.js`. Each `init*()` no-ops when its root element is
  absent (e.g. `initAdmin` returns early) — the new module follows the same pattern.
- Lowest-res derivative = `thumb` variant (800px). `derivativePath(id, "thumb",
  "jpeg")` (`src/server/services/derivatives.ts`) gives the on-disk path; `jpeg`
  is always generated and universally readable — use it for export.
- Title/commentary currently have **no** validation at ingest — the new rules
  are introduced fresh in a shared helper and reused by PATCH and CSV import.

## Server changes

### 1. `src/server/services/photos.ts`

- **`listAllPhotos(ctx): PhotoTableRow[]`** — new query joining `albums` for the
  album slug + name. Order `created_at DESC` (stable). Returns per row: `id`,
  `albumSlug`, `albumName`, `title`, `commentary`, and the EXIF fields already on
  `Photo` (`aperture`, `shutter`, `iso`, `focalLength`, `cameraBody`, `lens`).
- **`normalizePhotoFields(input: { title?: string|null; commentary?: string|null })`**
  — shared validation/sanitization mirroring the requirements:
  - `title`: trim; empty after trim → throw a 400-tagged `Error` (`statusCode = 400`).
  - `commentary`: trim; empty → `null`.
  - Only normalizes keys that are present (partial-update semantics).
- **`updatePhoto(ctx, id, fields): Photo`** — parameterized `UPDATE photos SET …
  WHERE id = ?` building the SET clause only from supplied (normalized) fields;
  throw a 404-tagged `Error` if the row doesn't exist; return the updated `Photo`
  via the existing `getPhoto`. Follows the `statusCode`-on-Error convention used
  by `deletePhoto`.

### 2. `src/server/services/csv.ts` (new)

Thin wrappers over **PapaParse** so we don't hand-roll RFC-4180 quoting:

- `toCsv(rows: string[][]): string` — `Papa.unparse` (auto-quotes fields with
  `,`/`"`/newline; escapes `"` → `""`; CRLF line endings).
- `parseCsv(text: string): string[][]` — `Papa.parse` with `skipEmptyLines`
  (handles quoted fields, embedded commas/quotes/newlines, `\n`/`\r\n`, trailing
  newline).
- `headerMatches(header, expected): boolean` — exact column-shape check
  (trim per cell) to reject CSVs that don't match the export header.

### 3. `src/server/routes/auth.ts` (extend `authRoutes`)

All guarded by `getAdminSession`; page route redirects, API routes return 401.

- **`GET /photos`** — if not admin, `reply.redirect("/admin/login?next=/admin/photos")`;
  else render `adminPhotosPage(listAllPhotos(ctx))` via `layout()`.
- **`PATCH /photos/:photoId`** — JSON body `{ title?, commentary? }`. Call
  `updatePhoto`; 200 with updated photo; 400 invalid title; 404 not found; 401
  unauth. (Used by inline auto-save, one request per dirty row.)
- **`GET /photos/export`** — build `photos.csv` (`id`, `path`, `title`,
  `comment`) with `toCsv`; for each photo read `derivativePath(id,"thumb","jpeg")`
  and add to a `jszip` instance under `images/{id}.jpg` (the same relative `path`
  written in the CSV); reply with the generated Buffer,
  `Content-Type: application/zip`, `Content-Disposition: attachment;
  filename="photos.zip"`. Reflects saved server data.
- **`POST /photos/import`** — accept JSON `{ csv: string }` (client reads the
  uploaded file's text and posts it — avoids adding a multipart parser to this
  scope). Parse with `parseCsv`, validate the header (`id,path,title,comment`),
  and for each row: match by `id`, apply `normalizePhotoFields` + `updatePhoto`;
  collect a per-row result `{ id, status: "updated"|"not_found"|"error",
  message? }`. Unknown ids / invalid rows are reported but don't abort (partial
  success). Return `{ results }`. May need a raised `bodyLimit` on this route for
  large CSVs.

### 4. `src/server/views/admin-photos.ts` (new)

- `adminPhotosPage(rows)` returns the `layout()` body:
  - Top bar: back-to-`/` link, title "Admin · Photos", filter `<input>`,
    Download `<button>`, Upload `<button>` + hidden `<input type="file"
    accept=".csv">`, and a "Sign out" form (`POST /admin/logout`).
  - A `<table>` with the requirement's column order: `#`, ID (link, new tab,
    `rel="noopener noreferrer"`), Image (`<img>` `mediaUrl(id,"thumb")`,
    lazy, meaningful `alt`), Album (link, new tab), Title (`<input>`),
    Commentary (`<textarea>`), EXIF (read-only compact summary
    ƒ/aperture · shutter · ISO · focal). Header cells associate with the
    editable inputs for a11y. Pagination controls + a status line ("Saved Ns
    ago · N pending").
  - Ship the full dataset as `<script type="application/json"
    id="photos-data">${jsonScript(rows)}</script>` for the client model.
  - Reuse existing Tailwind tokens (paper/ink/stone/hairline, font-mono/serif);
    add a stacked-card layout for mobile via responsive classes (no new design
    tokens). Respect `prefers-reduced-motion` (no transitions when reduced).

## Client changes

### 5. `src/client/ts/admin-photos.ts` (new), registered in `main.ts`

`initAdminPhotos()` returns early if `#photos-data` is absent.

- Build an in-memory model from the JSON island: `{ id, albumSlug, albumName,
  title, commentary, exif, state }` where `state ∈ clean|dirty|saving|saved|error`.
- **Filter:** free-text over id/album/title/commentary; recompute the filtered
  list; `#` column numbers the filtered view from 1. Edits persist in the model,
  so filtering/paging never loses unsaved edits.
- **Pagination:** page size ~50 over the filtered list; prev/next controls.
- **Inline edit:** `input` events update the model and mark the row `dirty`;
  empty-title shows an inline error and keeps the row dirty (not saved).
- **Auto-save:** a single 15s interval flushes dirty rows — one `PATCH
  /admin/photos/:id` per dirty row (`credentials:"include"`). No request when
  nothing is dirty. Transition row state saving→saved, or →error (stays dirty,
  retried next tick). Update the status line ("Saved Ns ago · N pending").
- **beforeunload:** if dirty rows exist, attempt a best-effort flush with
  `fetch(..., { keepalive: true })` and set `event.returnValue` to warn.
- **Download:** if dirty rows exist, flush first (or confirm), then navigate to
  `/admin/photos/export` to download the ZIP.
- **Upload:** read the chosen file via `File.text()`, `POST /admin/photos/import`
  with `{ csv }`; render the per-row summary; on success update the model +
  re-render.

### 6. `src/client/ts/viewer.ts` + `src/server/views/showcase.ts` (deep-linking)

- In `showcase.ts`, add `id="photo-${esc(photo.id)}"` to each `<figure>` in
  `photoRow` (for all viewers, not just admin) so the lightbox can resolve a
  photo by id. Add a "Manage photos" link (→ `/admin/photos`) to the existing
  admin strip for discoverability.
- In `viewer.ts`, on init parse `location.hash` (`#photo-<id>`); if it matches a
  figure, read that figure's `[data-viewer-open]` button `data-index` and call
  `openViewer(index, …)`. Keeps the index-based viewer intact.

## Build / deps

- Add `jszip` to `dependencies` (`pnpm add jszip`; types bundled). Confirm it's
  ESM-importable.
- Add `papaparse` to `dependencies` + `@types/papaparse` to `devDependencies`
  (`pnpm add papaparse && pnpm add -D @types/papaparse`) for the CSV
  reader/writer.
- No esbuild config change (entry stays `main.ts`); no Tailwind config change
  (`@source` already scans `src/server/**` and `src/client/ts/**`).
- No DB migration (requirement §7).

## Files

- **New (source):** `src/server/views/admin-photos.ts`,
  `src/client/ts/admin-photos.ts`, `src/server/services/csv.ts`.
- **New (tests):** `src/server/services/csv.test.ts`,
  `src/server/routes/auth.test.ts`, `src/server/views/admin-photos.test.ts`,
  `src/client/ts/admin-photos.test.ts`.
- **Modified:** `src/server/services/photos.ts` (+ `photos.test.ts`),
  `src/server/routes/auth.ts`, `src/client/ts/main.ts`,
  `src/client/ts/viewer.ts`, `src/server/views/showcase.ts`, `package.json`.

## Tests per phase (vitest, `*.test.ts` beside source)

General conventions: follow the existing `src/server/services/photos.test.ts`
pattern — mocked `config`/`paths`, `closeDb()` + `migrate()` in `beforeEach`,
in-memory SQLite. The vitest env is `node`, so **client code is made testable by
extracting pure functions** (no DOM); DOM wiring itself is covered by the manual
checks in §Verification, not unit tests.

### Phase 1 — `src/server/services/photos.test.ts` (extend)

- `normalizePhotoFields`: trims title and commentary; empty/whitespace title →
  throws with `statusCode === 400`; empty/whitespace commentary → `null`;
  absent keys are left untouched (partial semantics); valid values pass through.
- `updatePhoto`: updates title only / commentary only / both; partial update
  leaves the unspecified field unchanged; persists trimmed values; unknown id →
  throws with `statusCode === 404`; returns the updated `Photo`.
- `listAllPhotos`: returns one row per photo with correct `albumSlug` /
  `albumName` from the join; stable `created_at DESC` ordering; empty DB → `[]`.

### Phase 2 — `src/server/services/csv.test.ts` (new, pure unit)

- `toCsv`: quotes fields containing comma / double-quote / newline; escapes `"`
  → `""`; leaves plain fields unquoted; emits the header row.
- `parseCsv`: parses quoted fields with embedded commas, quotes, and newlines;
  handles trailing newline and `\r\n`; tolerates empty `comment`.
- Round-trip: `parseCsv(toCsv(rows))` deep-equals `rows` for an adversarial
  fixture (commas, quotes, newlines, empty fields, unicode).
- Header validation helper rejects a wrong/missing header.

### Phase 3 — `src/server/routes/auth.test.ts` (new, critical paths)

Build the app and use `app.inject`; mint a valid session cookie via the same
HMAC the `setAdminSession` helper uses (or sign in through `POST /admin/login`).

- Auth gate: no cookie → `GET /admin/photos` 302→`/admin/login?next=…`;
  `PATCH /admin/photos/:id` → 401; `GET /admin/photos/export` → 401;
  `POST /admin/photos/import` → 401.
- `PATCH`: valid body → 200 + updated photo and DB row changed; empty title →
  400; unknown id → 404; commentary `""` → stored `null`.
- `export`: 200, `Content-Type: application/zip`, `Content-Disposition`
  attachment; unzip the body and assert `photos.csv` exists with the right
  header + a row per photo and `images/{id}.jpg` entries.
- `import`: valid CSV updates matched rows and returns per-row `updated`;
  unknown id → `not_found` without aborting other rows (partial success);
  invalid title row → `error`, others still applied.

### Phase 4 — `src/server/views/admin-photos.test.ts` (new, render)

- Renders a `<table>` with the columns in the required order and one row per
  photo; ID/Album cells are `target="_blank" rel="noopener noreferrer"` links
  to `/albums/{slug}#photo-{id}` and `/albums/{slug}`.
- Escapes title/commentary via `esc()` (inject a `"`/`<` to assert no breakout);
  emits the `#photos-data` JSON island parseable back to the input rows.
- Empty dataset renders the table shell without throwing.

### Phase 5 — `src/client/ts/admin-photos.test.ts` (new, pure helpers)

Extract and test framework-free helpers (no DOM):

- `filterRows(rows, query)`: matches across id/album/title/commentary,
  case-insensitive; empty query → all rows.
- `paginate(rows, page, size)`: correct slice + page count; out-of-range page
  clamps.
- `dirtyRows(model)` / state transitions: editing marks `dirty`; empty title
  flags invalid (not flushed); a successful save → `saved`, a failure → `error`
  while staying dirty.

### Phase 6 — viewer helper

- `hashToIndex(hash, ids)` (pure): `#photo-<id>` → its index; unknown/missing
  hash → `null`. Unit-tested alongside the client helpers.

## Verification

1. `pnpm typecheck && pnpm lint && pnpm test` — all green.
2. `pnpm dev`, sign in at `/admin/login`, open `/admin/photos`:
   - Unauthenticated GET `/admin/photos` redirects to login; PATCH without
     session → 401.
   - Edit a title/commentary; within 15s confirm the PATCH fires and the status
     line shows saved; reload and confirm persistence. Clear a title → inline
     error, not saved. Clear commentary → stored as `null`.
   - Filter narrows rows and renumbers `#`; edit a row, filter it out and back —
     edit is retained.
   - ID link opens `/albums/{slug}#photo-{id}` in a new tab and the lightbox
     opens on that photo; Album link opens the album page.
   - Download → ZIP contains `photos.csv` + `images/{id}.jpg`; edit the CSV,
     Upload → table refreshes with updated values and a per-row summary; unknown
     id reported without aborting.
3. Keyboard: Tab reaches editable cells with visible focus; editing works without
   a mouse. Mobile width collapses to stacked cards.
