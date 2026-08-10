# Testing

Vitest (`vitest.config.ts`): `include: ["src/**/*.test.ts"]`,
`environment: "node"`, `pool: "forks"` (**required** for better-sqlite3),
`globals: false` (explicit imports). Run with `pnpm test`.

## Existing test files

| File | Covers |
| --- | --- |
| `src/server/routes/auth.test.ts` | The admin-route template — 401/redirect gates, PATCH, export ZIP, CSV import |
| `src/server/services/photos.test.ts` | createAlbum/ingestPhoto/deletePhoto/listAllPhotos with mocks |
| `src/server/views/admin-photos.test.ts` | SSR render + XSS escaping + JSON island |
| `src/client/ts/admin-photos.test.ts` | Pure model helpers (no DOM) |
| `csv.test.ts`, `derivatives.test.ts`, `concurrency.test.ts`, `viewer.test.ts` | Service/client units |

## Route-test harness pattern (`auth.test.ts:8-64`)

`vi.mock("../config.js")` with `paths.db = ":memory:"` and tmp dirs, then
`migrate()`, a bare `Fastify()` + `@fastify/cookie` + the route plugin under
`{ prefix: "/admin" }`, and a `signIn()` helper that POSTs `secret=s`
form-urlencoded and returns the `admin_session` cookie string for subsequent
`app.inject()` calls.

## Service-test mock set (`photos.test.ts:8-31`)

Mocks `node:fs/promises`, `./derivatives.js`, `./exif.js`, `./thumbhash.js`,
and `sharp` — reusable for an upload-route test.

## Gaps

No tests for `routes/admin.ts` (HMAC routes), `views/albums.ts`, or
`client/ts/admin.ts`.

Client testability convention: keep pure helpers separate from DOM wiring, as
in [admin-photos-page.md](admin-photos-page.md).
