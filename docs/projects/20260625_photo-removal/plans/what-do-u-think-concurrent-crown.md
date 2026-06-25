# Plan: Safe Photo Removal

## Context

Photos can currently be uploaded and replaced, but there is no way to remove them. As a gallery
grows, mistakes happen — wrong shots get ingested, test uploads linger, or a photo simply needs
to be pulled. Without a deletion path, the only recourse is touching the DB and `data/` by hand,
which is error-prone and leaves orphaned files.

"Safely" means three things here:
1. **No broken references** — `albums.cover_photo_id` has no FK constraint, so it won't be
   nulled automatically when a photo is deleted; we must handle it explicitly.
2. **No orphaned files** — `data/originals/<photoId>/` and `data/derivatives/<photoId>/` must be
   cleaned up after a successful DB delete.
3. **Idempotent and authenticated** — the endpoint returns 404 for unknown IDs and requires the
   same HMAC signature as the rest of the admin API.

## Approach

### 1. Service layer — `deletePhoto` (`src/server/services/photos.ts`)

```
deletePhoto(photoId: string): void
```

Steps (in order):
1. Verify the photo exists — `SELECT id FROM photos WHERE id = ?`. Throw a 404-style error if
   not found (caller surfaces as HTTP 404).
2. In a single synchronous SQLite transaction:
   a. `UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = ?` — clears dangling
      cover references before the photo row is gone.
   b. `DELETE FROM photos WHERE id = ?`
3. Invalidate `yearRangeCache` (set to `null`) — same as ingest does.
4. **Best-effort file cleanup** (after the transaction commits, so a cleanup failure never
   rolls back a successful DB delete):
   - `fs.rm(path.join(DATA_DIR, 'originals', photoId), { recursive: true, force: true })`
   - `fs.rm(path.join(DATA_DIR, 'derivatives', photoId), { recursive: true, force: true })`
   - Errors here are logged (`fastify.log.warn`) but not re-thrown.

File paths come from the existing `DATA_DIR` config already used in
`src/server/services/photos.ts` and `src/server/services/derivatives.ts`.

### 2. Admin route — `DELETE /admin/photos/:photoId` (`src/server/routes/admin.ts`)

- Register alongside the existing `POST /admin/photos` handler.
- Protected automatically by the existing HMAC `preHandler` hook (no extra auth code needed).
- Calls `deletePhoto(request.params.photoId)`.
- Returns **204 No Content** on success, **404** if the photo wasn't found.
- No request body needed.

### 3. Dev script — `scripts/remove-photo.ts`

Mirrors `scripts/upload-photo.ts` in structure:
- Builds a signed `DELETE /admin/photos/:photoId` request (HMAC over empty body + timestamp).
- Usage: `pnpm dev:remove-photo <photoId>`
- Add the corresponding `dev:remove-photo` script in `package.json`.

## Critical files

| File | Change |
|------|--------|
| `src/server/services/photos.ts` | Add `deletePhoto()` function |
| `src/server/routes/admin.ts` | Register `DELETE /admin/photos/:photoId` |
| `scripts/remove-photo.ts` | New HMAC-signed delete script |
| `package.json` | Add `dev:remove-photo` script entry |

## What is NOT in scope

- Album deletion (natural next step, but the user asked about photo removal).
- Undo / soft-delete / trash — this is a personal gallery; hard delete is appropriate.
- Moving a photo between albums (separate concern).

## Verification

1. `pnpm typecheck` — no type errors.
2. `pnpm lint` — clean.
3. Ingest a test photo, note its `photoId` from the DB or API response.
4. `pnpm dev:remove-photo <photoId>` — should return 204.
5. Confirm `data/originals/<photoId>/` and `data/derivatives/<photoId>/` are gone.
6. `GET /api/albums/:slug` — photo no longer appears.
7. Re-run with the same `photoId` — should return 404.
8. Ingest a photo, set it as the album cover, then delete it — confirm `albums.cover_photo_id`
   is NULL afterwards (check via sqlite3 CLI or a DB viewer).
