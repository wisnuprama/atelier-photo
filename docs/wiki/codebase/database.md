# Database schema + DAO layer

## Schema — `src/server/db/schema.sql`

Applied idempotently on boot by `migrate()` (`db/migrate.ts:9`). **There is no
versioned migration system** — just `CREATE TABLE IF NOT EXISTS`.

- `albums(id TEXT PK, slug TEXT NOT NULL, name TEXT NOT NULL, description, cover_photo_id, position INTEGER DEFAULT 0, created_at)`
  + `UNIQUE INDEX idx_albums_slug`
- `photos(id TEXT PK, album_id → albums(id) ON DELETE CASCADE, slug, filename, title, commentary, taken_at, width, height, thumbhash, camera_body, lens, focal_length, aperture, shutter, iso, created_at)`
  + `UNIQUE(album_id, filename)` (the upsert key)
  + `UNIQUE INDEX idx_photos_album_slug` + `idx_photos_album_taken`
  + `idx_photos_camera (camera_body)` + `idx_photos_lens (lens)` — shared by
  `/gear` grouping and `/search` exact match. Do not redefine them with other
  columns (`IF NOT EXISTS` checks the name only); a change needs a new name.
- `gear(kind TEXT CHECK IN ('camera','lens'), name TEXT, active INTEGER DEFAULT 1 CHECK IN (0,1), PK (kind, name))`
  — owner's active flag only; items are derived from `photos`. No row ⇒ active.

## DAO — `src/server/services/photos.ts`

Single-file repository; `getDb()` singleton from `db/index.ts:9`.

| Function | Line | Signature |
| --- | --- | --- |
| `listAlbums` | 225 | `(ctx) => AlbumWithCover[]` (ordered Discover first — `slug = DEFAULT_ALBUM_SLUG` — then `created_at DESC, rowid DESC`; `position` is stored but unused for order) |
| `getAlbum` | 235 | `(ctx, id) => AlbumWithCover \| undefined` |
| `getAlbumBySlug` | 244 | `(ctx, slug) => AlbumWithCover \| undefined` |
| `getPhoto` / `listPhotos` | 253 / 259 | `(ctx, id)` / `(ctx, albumId) => Photo[]` |
| `listAllPhotos` | 270 | `(ctx) => PhotoTableRow[]` — each row carries `coverState: "pinned" \| "auto" \| null` |
| `normalizePhotoFields` / `updatePhoto` | 318 / 341 | validation (throws statusCode-tagged Errors) + partial update |
| `setAlbumCover` / `resetAlbumCover` | 413 / 423 | `(ctx, photoId) => AlbumCoverResult` (`{ albumId, coverPhotoId, pinned }`, `:378`). The album is always resolved from the photo (`albumIdOfPhoto`, `:387`, 404-tagged), so a photo can only cover its own album. Reset is unconditional + idempotent |
| `slugify` | 434 | `(input: string) => string` (never empty) |
| `createAlbum` | 470 | `(_ctx, input: CreateAlbumInput) => { id, slug }` — `randomUUID()` id, deduped slug via `uniqueSlug` (`:445`), `nextAlbumPosition` (`:452`) |
| `ensureAlbum` | 488 | `(_ctx, slug, name?) => string` (get-or-create) |
| `ingestPhoto` | 539 | `(ctx, input: IngestPhotoInput) => Promise<IngestResult>` — see [ingest-pipeline.md](ingest-pipeline.md) |
| `deletePhoto` | 636 | `(ctx, photoId) => Promise<void>` (cover promotion + fs cleanup) |

`yearRangeCache` (`:202`) is invalidated at `:632` and `:661` — any new write
path that changes photo years must invalidate it too. (The cover writers do
not touch years, so they leave it alone.)

## Album cover

- `albums.cover_photo_id` is a plain column (not a foreign key). Writers: the
  seed script (pins every seeded album), `deletePhoto` (promotes the most
  recently **uploaded** remaining photo and pins it, or NULL), and
  `setAlbumCover` / `resetAlbumCover`.
- Read path: `COVER_JOIN` = `COALESCE(a.cover_photo_id, <auto cover>)`, used by
  `listAlbums` / `getAlbum` / `getAlbumBySlug` → `AlbumWithCover.cover`.
- `autoCoverSql(albumIdExpr)` (`:152`) is the single definition of the
  automatic cover: most recently taken photo, ties broken by
  `created_at DESC, id ASC`. It is shared by `COVER_JOIN` and by
  `listAllPhotos` (which marks the `"auto"` row), so the admin marker and the
  `/` card cannot disagree. It uses its own alias (`ac`), so it can be
  embedded in queries that already alias `photos p`.

## Gear DAO — `src/server/services/gear.ts`

| Export | Signature |
| --- | --- |
| `listGear` | `(ctx) => GearItem[]` — derived camera/lens items with count, UTC year range, latest sample photo, `active` (`COALESCE(gear.active, 1)`) |
| `setGearActive` | `(ctx, kind, name, active) => void` — 400/404-tagged Errors, upsert into `gear` |
| `isGearKind` | `(v: unknown) => v is GearKind` |
| `GEAR_COLUMN` | `{ camera: "camera_body", lens: "lens" }` — constant column map for gear SQL |

Gear toggles do not change photo years, so `yearRangeCache` is untouched.
Details: [gear-page.md](gear-page.md).
