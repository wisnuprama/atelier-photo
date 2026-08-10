# Ingest pipeline

`ingestPhoto(ctx, { album?, filename, title?, commentary?, data: Buffer })` —
`src/server/services/photos.ts:457-552`:

1. Rejects empty `data` and any filename with path components (basename check,
   `:464-467`).
2. `ensureAlbum(ctx, slugify(input.album || "discover"))` — defaults to the
   `discover` album, auto-created (`:470-475`).
3. Looks up `(album_id, filename)` to decide created vs replaced, reusing the
   existing id + slug on replace so `/media` URLs stay stable (`:478-493`).
4. Writes original to `${paths.originals}/${photoId}/${safeFilename}`
   (`:496-498`).
5. `Promise.all([extractExif, intrinsicDimensions, computeThumbHash, generateDerivatives])`
   (`:500-505`).
6. Single upsert transaction with `ON CONFLICT(album_id, filename) DO UPDATE`
   (`:509-548`), `COALESCE` preserving title/commentary when omitted.

## Supporting functions

- `generateDerivatives(ctx, photoId, original: Buffer): Promise<void>` —
  `services/derivatives.ts:56`. Sizes `thumb` (800px) / `full` (2400px) ×
  formats avif/webp/jpeg (`DERIVATIVES` `:17`, `DERIVATIVE_FORMATS` `:35`).
  Single decode → raw bitmap → per-format encode, atomic temp+rename.
- `derivativePath(photoId, variant, ext): string` — `derivatives.ts:42` →
  `data/derivatives/{id}/{variant}.{ext}`.
- `extractExif(_ctx, original: Buffer): Promise<PhotoExif>` —
  `services/exif.ts:81` (never throws).
- `computeThumbHash(_ctx, original: Buffer): Promise<string>` —
  `services/thumbhash.ts:25`.

## Concurrency

`createLimiter(max): Limiter` — `services/concurrency.ts:13`. The shared
process-wide instance lives in `services/ingest-limiter.ts:8`:
`export const ingestLimit = createLimiter(config.ingestConcurrency)`
(default 1). Both ingestion routes wrap `ingestPhoto` in it — HMAC
`routes/admin.ts:90` and session `routes/auth.ts` (`/photos/upload`).
**Import `ingestLimit` from `ingest-limiter.ts`** for any new upload path —
parallel routes with their own limiter each get their own cap, defeating the
purpose. (Because the limiter is module-level, any test whose imports reach
`auth.ts`/`admin.ts` must mock `config` with an `ingestConcurrency` value —
see [testing.md](testing.md).)

## File locations

`paths.db` = `data/gallery.db`, `paths.originals` = `data/originals`,
`paths.derivatives` = `data/derivatives` (`config.ts:43-47`).

Upload transport (multipart parsing, body limits):
[multipart-uploads.md](multipart-uploads.md). DB side:
[database.md](database.md).
