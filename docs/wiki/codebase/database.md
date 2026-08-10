# Database schema + DAO layer

## Schema — `src/server/db/schema.sql`

Applied idempotently on boot by `migrate()` (`db/migrate.ts:9`). **There is no
versioned migration system** — just `CREATE TABLE IF NOT EXISTS`.

- `albums(id TEXT PK, slug TEXT NOT NULL, name TEXT NOT NULL, description, cover_photo_id, position INTEGER DEFAULT 0, created_at)`
  + `UNIQUE INDEX idx_albums_slug`
- `photos(id TEXT PK, album_id → albums(id) ON DELETE CASCADE, slug, filename, title, commentary, taken_at, width, height, thumbhash, camera_body, lens, focal_length, aperture, shutter, iso, created_at)`
  + `UNIQUE(album_id, filename)` (the upsert key)
  + `UNIQUE INDEX idx_photos_album_slug` + `idx_photos_album_taken`

## DAO — `src/server/services/photos.ts`

Single-file repository; `getDb()` singleton from `db/index.ts:9`.

| Function | Line | Signature |
| --- | --- | --- |
| `listAlbums` | 204 | `(ctx) => AlbumWithCover[]` (ordered `position ASC, created_at ASC`) |
| `getAlbum` | 214 | `(ctx, id) => AlbumWithCover \| undefined` |
| `getAlbumBySlug` | 223 | `(ctx, slug) => AlbumWithCover \| undefined` |
| `getPhoto` / `listPhotos` | 232 / 238 | `(ctx, id)` / `(ctx, albumId) => Photo[]` |
| `listAllPhotos` | 249 | `(ctx) => PhotoTableRow[]` |
| `normalizePhotoFields` / `updatePhoto` | 291 / 314 | validation (throws statusCode-tagged Errors) + partial update |
| `slugify` | 352 | `(input: string) => string` (never empty) |
| `createAlbum` | 388 | `(_ctx, input: CreateAlbumInput) => { id, slug }` — `randomUUID()` id, deduped slug via `uniqueSlug` (`:363`), `nextAlbumPosition` (`:370`) |
| `ensureAlbum` | 406 | `(_ctx, slug, name?) => string` (get-or-create) |
| `ingestPhoto` | 457 | `(ctx, input: IngestPhotoInput) => Promise<IngestResult>` — see [ingest-pipeline.md](ingest-pipeline.md) |
| `deletePhoto` | 554 | `(ctx, photoId) => Promise<void>` (cover promotion + fs cleanup) |

`yearRangeCache` (`:187`) is invalidated at `:550` and `:579` — any new write
path that changes photo years must invalidate it too.
