# Admin: Album Creation + Photo Upload Modal

## Context

The admin can currently only create albums and ingest photos via the HMAC-signed CLI/iOS-Shortcut routes (`POST /admin/albums`, `POST /admin/photos` in `src/server/routes/admin.ts`). The browser session-admin UI (cookie auth, `src/server/routes/auth.ts`) can edit/delete photos but cannot create albums or upload. This project adds:

1. **Create album** from the album list page (`/`) — admin-only "New album" button opening a small modal (name + optional description), redirecting to the new album page on success.
2. **Upload photos** from an album detail page (`/albums/:slug`) — admin-only "Upload photos" button opening a modal with drag-and-drop and a file picker, per-file progress, sequential uploads.

## Key design decisions

- **Routes live in the session scope (`authRoutes`)** with collision-free paths — `POST /admin/albums` and `POST /admin/photos` are already taken by the HMAC scope, and Fastify throws on duplicate METHOD+path. New paths follow the existing verb-suffix convention (`/photos/import`, `/photos/export`):
  - `POST /admin/albums/create` — JSON `{ name, description? }` → 201 `{ id, slug }`
  - `POST /admin/photos/upload` — multipart, exactly **one file per request** + `album` (slug) field → 200 `{ id, slug, status: "created" | "replaced" }`
- **One file per request, sequential client loop**: keeps each request far below the 60 MB buffered-body ceiling, enables real per-file progress via `XMLHttpRequest.upload.onprogress` (fetch has no upload progress), makes failures individually retryable. Admins bypass rate limiting (`rate-limit.ts` allowList).
- **No CSRF token** — matches existing convention (SameSite=strict cookie + `credentials: "include"`).
- **Reuse, don't rebuild**: `createAlbum` (src/server/services/photos.ts:388, dedupes slug, assigns position) and `ingestPhoto` (photos.ts:457, auto-creates album by slug, upserts on `(album_id, filename)`, writes original + derivatives) are used as-is. No DB changes.
- **Accepted types (client-side filter)**: `image/jpeg, image/png, image/webp, image/avif, image/tiff, image/gif`. No HEIC (prebuilt sharp can't decode it; iOS Safari converts HEIC→JPEG on file input anyway). Server still 400s on undecodable data.
- **Album-create UI is a modal** (not inline form) — keeps the editorial grid untouched and shares the modal helper built for upload. On success redirect to `/albums/{slug}`.

## Step 1 — Extract shared multipart parser + ingest limiter

- **New `src/server/services/multipart.ts`**: move `MAX_BODY` (rename `MAX_UPLOAD_BYTES = 60 * 1024 * 1024`), `ParsedMultipart`, and `parseMultipart()` verbatim from `src/server/routes/admin.ts:10-44`. Signature: `parseMultipart(headers, raw, limits?: { fileSize?: number; files?: number })` with defaults `{ fileSize: MAX_UPLOAD_BYTES, files: 50 }`.
- **New `src/server/services/ingest-limiter.ts`**: `export const ingestLimit = createLimiter(config.ingestConcurrency)` — moved from admin.ts:16 so both auth and HMAC scopes share one process-wide sharp-concurrency cap (per the comment at admin.ts:12-15).
- **Modify `src/server/routes/admin.ts`**: delete the moved code; import from the new modules. No behavior change.

## Step 2 — Server routes (`src/server/routes/auth.ts`)

- Register a scope-local multipart content-type parser mirroring admin.ts:78-84 (`parseAs: "buffer"`, `bodyLimit: MAX_UPLOAD_BYTES`). Parsers are per-plugin-scope, so no interference with the HMAC scope (already proven by the urlencoded parser at auth.ts:47).
- **`POST /albums/create`** (JSON body, default 1 MB limit fine):
  - 401 without session (standard guard); 400 on missing/blank `name` after trim; else `createAlbum(ctxFromRequest(request), { name, description? })` → 201 `{ id, slug }`.
- **`POST /photos/upload`**:
  - 401 without session; 415 unless multipart + Buffer body (mirror admin.ts:93-96); `parseMultipart(headers, body, { files: 1 })`; 400 on missing `album` field or `files.length !== 1`; then `ingestLimit(() => ingestPhoto(ctx, { album, filename, data }))` → 200 with the `IngestResult`; catch → log warn + 400 `{ error: "Could not process image" }` (covers bad filenames / undecodable images).
- New imports: `createAlbum, ingestPhoto` from `../services/photos.js`; `MAX_UPLOAD_BYTES, parseMultipart` from `../services/multipart.js`; `ingestLimit` from `../services/ingest-limiter.js`.

## Step 3 — Views + page route

- **`src/server/routes/pages.ts` `GET /`**: add `const isAdmin = getAdminSession(request)` (import already present at pages.ts:4) and pass to `albumsPage(...)`.
- **`src/server/views/albums.ts`**: signature → `albumsPage(albums, yearRange, isAdmin = false)`. When admin:
  - Admin strip above the grid, mirroring showcase.ts:146-158 styling: `Admin · [New album button data-album-create-open] · Manage photos link · Sign out form`.
  - Create modal markup after `</main>` (per approved mockup): `<div id="albumCreateModal" class="hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-labelledby="albumCreateTitle" tabindex="-1">` with scrim `<div class="absolute inset-0 bg-ink/30" data-modal-close>`, centered panel `bg-paper border border-hairline p-8 w-[min(92vw,480px)]`; serif "New album" heading; form `#albumCreateForm` with Name (required) input + "Description · optional" textarea using the existing input recipe (`border border-hairline bg-paper px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-ink`), inline error `#albumCreateError` (`font-mono text-[9px] label text-red-600 uppercase`, hidden by default), footer buttons right-aligned: Cancel (outline recipe, `data-modal-close`) + Create (primary recipe `bg-ink text-paper`).
- **`src/server/views/showcase.ts`**: add to the existing admin strip (:146-158) an `Upload photos` button (`data-upload-open`, same text-link styling) with `·` separator. When admin, append an upload modal after the lightbox:
  - `<div id="uploadModal" data-album-slug="${esc(album.slug)}" class="hidden fixed inset-0 z-[100]" role="dialog" aria-modal="true" ...>` — scrim, centered panel `w-[min(92vw,560px)] max-h-[85dvh] overflow-y-auto`.
  - Layout (per approved mockup): serif "Upload photos" heading with the album name as a mono uppercase subtitle beneath it.
  - Dropzone `#uploadDropzone` (`border border-dashed border-hairline px-6 py-12 text-center cursor-pointer`): upload icon (lucide-static), "Drag photos here or click to browse" hint, second muted hint line "Multiple files · JPEG PNG WEBP AVIF TIFF GIF · 60 MB max", and hidden `<input id="uploadInput" type="file" multiple class="sr-only" accept="image/jpeg,image/png,image/webp,image/avif,image/tiff,image/gif">`. **Multi-file is required**: the input is `multiple`, drops accept any number of files, and each file becomes an independent queue row.
  - File status list `<ul id="uploadList" aria-live="polite">` — each row: filename (truncated) · size (`formatBytes`) · mono uppercase status (`Queued` → `Uploading N%` with a 2px `bg-hairline`/`bg-ink` progress bar under the row → `Created ✓` / `Replaced ✓`, or red `Unsupported type` / error text). Hairline dividers between rows.
  - Footer: left, a live counter "N of M uploaded" (`font-mono text-[9px] label text-stone uppercase`); right, the Done button (`data-modal-close`, primary recipe) — visually disabled while uploads run.
  - z-[100] sits above year rail (z-30), below the admin long-press menu (z-[200]); lightbox (z-50) never open simultaneously.

## Step 4 — Client TS

- **New `src/client/ts/modal.ts`** — shared helper following viewer.ts conventions:
  - `createModal(root: HTMLElement): ModalController` with `open()` (save `document.activeElement`, unhide, `body.overflow = "hidden"`, focus root), `close()` (reverse + restore focus), `isOpen()`, `setLocked(locked)` (while locked, Escape/scrim/close buttons are ignored — uploads in flight). Wires `[data-modal-close]` clicks, Escape, and a Tab focus trap. No animations, so no reduced-motion work needed.
- **New `src/client/ts/album-create.ts`** — `initAlbumCreate()`, early-return without `#albumCreateModal`. Open on `[data-album-create-open]`. Submit → client-validate name, `fetch("/admin/albums/create", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body })`; 201 → `location.href = "/albums/" + encodeURIComponent(slug)`; else show inline error.
- **New `src/client/ts/upload.ts`** — `initUpload()`, early-return without `#uploadModal`; album slug from `modal.dataset.albumSlug`. Exported pure helpers for node-env tests: `ACCEPTED_TYPES`, `MAX_FILE_BYTES` (60 MB), `fileError(file): string | null`, `formatBytes(n): string`.
  - Dropzone: click → `input.click()`; `dragover/dragenter` → preventDefault + highlight (`border-ink bg-stone/5`); `dragleave/drop` → unhighlight; drop/change → enqueue files (reset input value after).
  - Each file gets a `<li>` row: truncated filename, size, status span. Files failing `fileError()` show the reason immediately and are skipped.
  - Sequential upload loop using `XMLHttpRequest` (`withCredentials = true`, `FormData` with `album` + `file`); `upload.onprogress` → "uploading N%"; 200 → "created ✓"/"replaced ✓"; failure → red status with server error, loop continues. `setLocked(true)` while running; drops during a run extend the queue.
  - Close (only when unlocked): if ≥1 success this session → `location.reload()` (SSR re-renders new photos/year rail); else plain close.
- **Modify `src/client/ts/main.ts`**: call `initAlbumCreate()` and `initUpload()`.

## Step 5 — Tests (vitest, existing patterns)

- **New `src/server/services/multipart.test.ts`** — hand-built multipart buffers: field+file round-trip, multiple files, `files: 1` limit.
- **Modify `src/server/routes/auth.test.ts`** — add `ingestConcurrency: 1` to the config mock (line ~9): auth.ts now transitively imports `ingest-limiter.ts`, whose module-level `createLimiter(config.ingestConcurrency)` needs it. Only existing test touched.
- **New `src/server/routes/auth.upload.test.ts`** — mirror the auth.test.ts harness (`:memory:` db, `migrate()`, bare Fastify + @fastify/cookie + authRoutes at `/admin`, `signIn()` helper). `vi.mock("../services/photos.js")` via `importOriginal`, stubbing only `ingestPhoto`. Cases:
  - albums/create: 401 no cookie; 400 blank name; 201 `{ id, slug }` + row in db; slug dedupe ("Trip" twice → `trip`, `trip-2`).
  - photos/upload: 401 no cookie; 415 on JSON; 400 missing album field; 400 zero files; happy path (hand-built multipart inject) asserting `ingestPhoto` args + 200 shape; 400 when `ingestPhoto` rejects.
- **New `src/client/ts/upload.test.ts`** — pure helpers (`fileError`, `formatBytes`), node env, viewer.test.ts style.

## Files summary

New: `src/server/services/multipart.ts`, `src/server/services/ingest-limiter.ts`, `src/client/ts/modal.ts`, `src/client/ts/album-create.ts`, `src/client/ts/upload.ts`, plus 3 test files.
Modified: `src/server/routes/admin.ts` (extraction only), `src/server/routes/auth.ts`, `src/server/routes/pages.ts`, `src/server/views/albums.ts`, `src/server/views/showcase.ts`, `src/client/ts/main.ts`, `src/server/routes/auth.test.ts` (config mock).

## Sequencing

1. Step 1 extraction → `pnpm typecheck && pnpm test` green before anything else.
2. Step 2 routes + server tests (provable via `app.inject` before UI exists).
3. Step 3 views + pages.ts.
4. Step 4 client + helper tests.
5. Verification.

## Verification

Commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

Manual (`pnpm dev`, ADMIN_HMAC_SECRET set):
1. Logged out: `/` has no admin strip/modal; POSTs to `/admin/albums/create` and `/admin/photos/upload` → 401.
2. Log in at `/admin/login`. On `/`: "New album" opens modal; Escape/scrim/Cancel close + restore focus; blank name → inline error; valid create → redirected to the new empty album page.
3. On album page: "Upload photos" opens modal; drag-over highlights dropzone; drop 3 JPEGs → three rows with live percent, sequential, "created ✓"; drop a .txt → "unsupported type" (never sent); re-drop a same-named JPEG → "replaced ✓"; Escape ignored mid-upload; "Done" reloads showing new photos with thumbhashes + year rail.
4. File-picker path: click dropzone → multi-select → same behavior.
5. HMAC regression: existing CLI scripts (`scripts/upload-photo.ts`, `scripts/create-album.ts`) still succeed against dev server.
