# Ingest Pipeline Plan — Photo Gallery Web

## Context

The [bootstrap pass](./bootstrap.md) stood up the full
skeleton: SSR views, viewer, year rail, nav, lazy-load, ThumbHash decode on the
client, HMAC auth, and multipart parsing are all **real**. What it deliberately
deferred is the **ingest/derivative pipeline** — the keystone that turns the
working shell into a usable gallery.

Source of truth:
[`REQUIREMENTS.md`](../REQUIREMENTS.md) (Functional #4
Admin/ingestion; the "Open notes" on the real derivative pipeline) and
[`DESIGN.html`](../DESIGN.html).

This pass makes adding a photo actually work end-to-end and replaces the grey
placeholder SVG with real, format-negotiated derivatives.

## What is stubbed today (the gap)

- `services/photos.ts → ingestPhoto()` — validates shape, returns
  `{ status: "stub" }`. No DB write, no file write.
- `services/derivatives.ts → generateDerivatives()` — `throw "not implemented"`.
- `routes/media.ts` — falls through to `placeholderSvg()` because no derivatives
  ever exist on disk.
- EXIF + intrinsic dimensions + real ThumbHash at ingest — never invoked
  (`exifr` is a dependency; `encodeThumbHash()` exists and is exercised only by
  the seed with synthetic data).

Everything downstream already waits for this: the `(album_id, filename)` UNIQUE
upsert key, `media.ts`'s `existsSync(derivativePath)` check, and the client
ThumbHash decode + lazyload.

## Decisions (locked with the user)

1. **Album auto-create on ingest.** If `albumId` is omitted, default to an album
   `discover` (name "Discover"), created on first use. Also expose:
   - `GET /api/albums` already exists (read) — the iOS Shortcut uses it to pick a
     target album.
   - **New** `POST /admin/albums` (HMAC) — create an album from the Shortcut.
2. **Derivative formats:** **AVIF, WebP, and JPEG** (JPEG as the universal
   fallback), generated per size.
3. **Storage:** originals and derivatives live under `DATA_DIR`
   (`config.paths.originals` / `config.paths.derivatives`) — the Podman volume.
4. **Identity = random `id` + human `slug`** for both `albums` and `photos`. The
   `id` is a random, opaque, immutable primary key (drives FS paths, joins, and
   `/media/:id/...`). The `slug` is human-readable, re-derivable, used for
   readable URLs/search, and backed by an index. Splitting them means a rename
   re-slugs without moving any files. See [Schema changes](#0-schema-changes).

## Design

### 0. Schema changes — `db/schema.sql`

No existing data to preserve, so **edit `schema.sql` in place and recreate the
DB** (no `ALTER TABLE` / migration shimming). `migrate.ts` already applies the
schema idempotently on boot; to reset, delete `data/gallery.db*` and re-run
`pnpm db:migrate && pnpm db:seed`.

Fold a `NOT NULL` `slug` into both `CREATE TABLE`s; keep `id` as the random PK and
`(album_id, filename)` as the photo replace key.

```sql
-- albums: add `slug TEXT NOT NULL` column
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_slug ON albums (slug);

-- photos: add `slug TEXT NOT NULL` column, unique within an album
CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_album_slug ON photos (album_id, slug);
```

- **`id` generation:** random opaque id (`crypto.randomUUID()`, no new dep) for
  every new album/photo. Never changes once assigned.
- **Indexes** (the "fast read & search" requirement): unique slug indexes above,
  plus the existing `idx_photos_album_taken`. The unique indexes double as the
  lookup path for slug→row resolution in routes.
- **Replace stays keyed on `(album_id, filename)`.** Because `id` is random, the
  ingest path does a one-row indexed lookup on `(album_id, filename)` to **reuse
  the existing `id`** on replace (so FS paths and `/media` URLs stay stable); only
  a brand-new photo mints a fresh `id`.
- **URL impact:** album ids are no longer human-readable, so album URLs switch
  from id to slug — `GET /albums/:slug` (was `/albums/:id`). `photos.album_id`
  FK still references the random `albums.id`.

### 1. Derivatives pipeline — `services/derivatives.ts`

Implement the real `sharp` pipeline for each `DerivativeSpec`
(`thumb` 800px / `full` 2400px longest edge), emitting **all three formats**:

- For each size × format `{avif, webp, jpeg}`: `sharp(original).rotate()`
  (honor EXIF orientation) `.resize(maxEdge, maxEdge, { fit: "inside",
  withoutEnlargement: true })` then encode (`.avif({quality})`,
  `.webp({quality})`, `.jpeg({quality, mozjpeg:true})`), write to
  `derivativePath(photoId, variant, format)`.
- **Change the path helper** from `.webp`-hardcoded to format-aware:
  `derivativePath(photoId, variant, ext)` → `${derivatives}/${photoId}/${variant}.${ext}`.
- Keep `DERIVATIVES` / `DERIVATIVE_NAMES` as the size registry; add a
  `DERIVATIVE_FORMATS` registry `[{ext:"avif",mime,encode}, {ext:"webp",…},
  {ext:"jpeg",…}]` with quality per format (avif ~50, webp ~80, jpeg ~82).
- Write atomically (temp file + rename) so a crashed ingest can't leave a
  half-written derivative that `existsSync` would treat as valid.

### 2. ThumbHash + dimensions at ingest

- Read intrinsic `width`/`height` from `sharp(original).metadata()` (post-rotate
  orientation-corrected dimensions).
- Downscale to ≤100px longest edge, `.ensureAlpha().raw()`, feed RGBA into the
  existing `encodeThumbHash()`. Store base64.

### 3. EXIF extraction — `services/exif.ts` (new)

- Use `exifr.parse(original)` to pull: `taken_at` (DateTimeOriginal → ISO-8601),
  `camera_body` (Make + Model), `lens` (LensModel), `focal_length`
  (FocalLength → "85mm"), `aperture` (FNumber → "f/1.8"), `shutter`
  (ExposureTime → "1/250s"), `iso` (ISO).
- Format to the same display strings the viewer/showcase already expect (see
  `views/showcase.ts` EXIF rows). Each field is nullable — missing EXIF must not
  fail ingest; `taken_at` falls back to `null` (sorts last) or upload time (TBD,
  default: `null` and let `created_at` break ties, matching `listPhotos`).

### 4. Ingest orchestration — `services/photos.ts → ingestPhoto()`

Replace the stub with a real upsert (wrap DB writes in a transaction):

1. Resolve album by **slug**: use `input.album` (slug) or default `discover`;
   auto-create the album (random `id`, slug `discover`, name "Discover") if
   missing.
2. Resolve `photoId`: look up the existing row by `(album_id, filename)`; **reuse
   its `id`** if found (replace), otherwise mint a **random** `id` (create). This
   keeps derivative paths and `/media` URLs stable across re-uploads.
3. Compute `slug` from the filename base (or title), sanitized; dedupe within the
   album against `(album_id, slug)` (append `-2`, `-3`, …). On replace, keep the
   existing slug unless the source changed.
4. Write original to `paths.originals/${photoId}/<filename>` (mkdir -p).
5. `extractExif()` + dimensions + ThumbHash + `generateDerivatives(photoId, …)`.
6. `INSERT … ON CONFLICT(album_id, filename) DO UPDATE` all derived columns
   (recompute-on-replace per REQUIREMENTS #4). On replace, regenerate
   derivatives/ThumbHash and overwrite originals.
7. Return `{ id, slug, status: "created" | "replaced" }`.

Add helpers in `photos.ts`: `createAlbum({ name, slug?, description? })` (mints
random id, derives slug from name), `ensureAlbum(slug, name?)`,
`getAlbumBySlug(slug)`, and a shared `slugify()` util.

### 5. Routes

- **`routes/admin.ts`** — `POST /admin/photos` already loops files; wire the real
  `ingestPhoto()` result (`created`/`replaced` counts). Field `album` (slug) now
  optional (defaults to `discover`). Add **`POST /admin/albums`** (fields:
  `name`, `slug?`, `description?`) → `createAlbum()`, HMAC-protected by the
  existing `preValidation` hook; returns the new `{ id, slug }`.
- **`routes/pages.ts` + `routes/api.ts`** — album routes resolve by **slug**:
  `GET /albums/:slug` and `GET /api/albums/:slug` call `getAlbumBySlug()`.
  `views/albums.ts` links `href="/albums/${slug}"`. `GET /api/albums` returns
  `id`, `slug`, `name` per album so the Shortcut can pick a slug.
- **`routes/media.ts`** — serve real derivatives with **content negotiation**:
  parse the request `Accept` header, pick the best available format in order
  `avif → webp → jpeg`, stream `derivativePath(photoId, variant, ext)`, set the
  matching `Content-Type` + `Vary: Accept` + immutable `Cache-Control`. Keep the
  sized placeholder SVG only as the fallback when no derivative exists yet. This
  preserves the single-URL `data-src` + IntersectionObserver lazyload (no
  `<picture>` rewrite needed).

### 6. iOS Shortcut contract (document in `admin.ts`)

- `POST /admin/albums` → create a named album once (returns `{ id, slug }`).
- `GET /api/albums` → list `{ id, slug, name }` to pick a target **slug** from.
- `POST /admin/photos` (multipart): `file` part(s) + optional `album` (slug,
  default `discover`), `title`, `commentary`. Same filename in the same album
  replaces.

## Verification

1. Reset: delete `data/gallery.db*`, then `pnpm db:migrate` creates the schema
   (with `slug` columns + unique indexes) and `pnpm db:seed` regenerates seed
   albums/photos with random `id`s and derived slugs. `discover` album is created
   lazily on first ingest.
2. `curl POST /admin/albums` with valid HMAC → album created with random `id` +
   slug; `GET /api/albums` lists `{ id, slug, name }`; `/albums/:slug` renders.
   Bad signature → 401.
3. `curl POST /admin/photos` with a real JPEG → 200 `{status, created}`; row in
   `photos` with real EXIF, dimensions, ThumbHash; `originals/` + `derivatives/`
   (avif/webp/jpeg × thumb/full) on disk.
4. Open `/` and an album: real images load (blur-up → decode), no CLS. DevTools
   shows AVIF served to Chrome, JPEG to a forced `Accept: image/*`.
5. Re-upload same filename → `replaced`; **same `id` + slug reused** (derivative
   dir and `/media` URL unchanged); derivatives + ThumbHash recomputed in place.
6. Ingest a photo with **no EXIF** → succeeds; nullable fields blank in viewer.
7. `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` clean.
8. `podman build` + quadlet: originals/derivatives persist in the volume across
   restarts.

## Out of scope this pass

Admin replace/delete **UI**; bulk-upload batching/queues; pagination /
virtualization for hundreds of photos; per-derivative cache eviction.
