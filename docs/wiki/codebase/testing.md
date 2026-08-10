# Testing

Vitest (`vitest.config.ts`): `include: ["src/**/*.test.ts"]`,
`environment: "node"`, `pool: "forks"` (**required** for better-sqlite3),
`globals: false` (explicit imports). Run with `pnpm test`.

## Existing test files

| File | Covers |
| --- | --- |
| `src/server/routes/auth.test.ts` | The admin-route template — 401/redirect gates, PATCH, export ZIP, CSV import |
| `src/server/routes/auth.upload.test.ts` | `POST /admin/albums/create` + `POST /admin/photos/upload` — auth gates, validation, slug dedupe, multipart happy path (`ingestPhoto` stubbed via `importOriginal`), ingest failure |
| `src/server/services/photos.test.ts` | createAlbum/ingestPhoto/deletePhoto/listAllPhotos with mocks |
| `src/server/services/multipart.test.ts` | `parseMultipart` — field/file round-trip, ordering, `files` limit, empty form (hand-built multipart buffers) |
| `src/server/views/admin-photos.test.ts` | SSR render + XSS escaping + JSON island |
| `src/client/ts/admin-photos.test.ts` | Pure model helpers (no DOM) |
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
`client/ts/{modal,album-create,upload}.ts` (vitest runs in node — only their
pure helpers are covered).

Client testability convention: keep pure helpers separate from DOM wiring, as
in [admin-photos-page.md](admin-photos-page.md).
