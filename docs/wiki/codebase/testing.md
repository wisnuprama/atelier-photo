# Testing

Vitest (`vitest.config.ts`): `include: ["src/**/*.test.ts"]`,
`environment: "node"`, `pool: "forks"` (**required** for better-sqlite3),
`globals: false` (explicit imports). Run with `pnpm test`.

## Existing test files

| File | Covers |
| --- | --- |
| `src/server/routes/auth.test.ts` | The admin-route template — 401/redirect gates, PATCH, export ZIP, CSV import, `POST\|DELETE /admin/photos/:id/cover` |
| `src/server/routes/auth.upload.test.ts` | `POST /admin/albums/create` + `POST /admin/photos/upload` — auth gates, validation, slug dedupe, multipart happy path (`ingestPhoto` stubbed via `importOriginal`), ingest failure |
| `src/server/routes/api.test.ts` | `GET /api/albums` — response shape (`{ id, slug, name }` per album) and order (Discover first, then newest) |
| `src/server/services/photos.test.ts` | createAlbum/ingestPhoto/deletePhoto/listAllPhotos/`listAlbums` ordering with mocks (album `created_at` set in `datetime('now')` format, not ISO); `setAlbumCover / resetAlbumCover` (R4 album scoping, R8 delete promotion, `coverState` marking, auto-cover tie-break) |
| `src/server/routes/auth.gear.test.ts` | `POST /admin/gear/active` — 401 before body validation, 400 cases, 404 unknown name, 204 + persistence |
| `src/server/routes/pages.gear.test.ts` | `GET /gear` — title, Gear nav current, visitor vs admin markup, inactive section placement (registers `pageRoutes` + `authRoutes`; config mock adds `contactEmail`/`contactGreeting`) |
| `src/server/services/gear.test.ts` | `listGear` grouping/counts, blank exclusion, default-active + upsert, UTC years, ordering, sample tie-break, exact-string names; `setGearActive` 400/404 (kind-scoped). Inserts photos with raw SQL — no ingest mocks |
| `src/server/views/gear.test.ts` | `gearPage` structure, visitor/admin empty states, checkbox outside the link, live region, alt text, XSS, `gearSearchHref` encoding, meta/year helpers |
| `src/server/views/layout.test.ts` | Gear link in both navs; `aria-current="page"` on exactly one link in desktop **and** mobile nav |
| `src/client/ts/gear.test.ts` | Pure gear toggle helpers — `toggleRequest`, `targetListKey`, `moveMessage`, `insertIndex` |
| `src/server/services/multipart.test.ts` | `parseMultipart` — field/file round-trip, ordering, `files` limit, empty form (hand-built multipart buffers) |
| `src/server/views/admin-photos.test.ts` | SSR render + XSS escaping + JSON island + cover badge/button |
| `src/client/ts/admin-photos.test.ts` | Pure model helpers (no DOM), incl. `coverAction` / `applyAlbumCover` |
| `src/client/ts/upload.test.ts` | Pure upload helpers — `fileError`, `formatBytes` |
| `csv.test.ts`, `derivatives.test.ts`, `concurrency.test.ts`, `viewer.test.ts` | Service/client units |

## Route-test harness pattern (`auth.test.ts`, `auth.upload.test.ts`)

`vi.mock("../config.js")` with `paths.db = ":memory:"` and tmp dirs, then
`migrate()`, a bare `Fastify()` + `@fastify/cookie` + the route plugin under
`{ prefix: "/admin" }`, and a `signIn()` helper that POSTs `secret=s`
form-urlencoded and returns the `admin_session` cookie string for subsequent
`app.inject()` calls.

⚠️ The config mock **must include `ingestConcurrency`** — `auth.ts`
transitively imports `services/ingest-limiter.ts`, whose module-level
`createLimiter(config.ingestConcurrency)` throws on a missing value.
`auth.upload.test.ts` also shows partial service mocking:
`vi.mock("../services/photos.js", importOriginal)` keeping the real
`createAlbum` while stubbing `ingestPhoto`, and hand-building multipart
payloads for `app.inject`.

## Service-test mock set (`photos.test.ts:8-31`)

Mocks `node:fs/promises`, `./derivatives.js`, `./exif.js`, `./thumbhash.js`,
and `sharp` — reusable for an upload-route test.

## Gaps

No tests for `routes/admin.ts` (HMAC routes), `views/albums.ts`,
`views/showcase.ts`, `client/ts/admin.ts`, or the DOM halves of
`client/ts/{modal,album-create,upload,gear}.ts` (vitest runs in node — only their
pure helpers are covered).

Client testability convention: keep pure helpers separate from DOM wiring, as
in [admin-photos-page.md](admin-photos-page.md).
