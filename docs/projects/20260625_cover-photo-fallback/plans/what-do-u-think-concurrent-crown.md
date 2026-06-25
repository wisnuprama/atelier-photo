# Plan: Smart Cover Photo Fallback on Deletion

## Context

When a photo is deleted, `deletePhoto()` currently does:
```sql
UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = ?
```
This leaves an album with no cover even when other photos are available. The improvement: when the deleted photo is the album's cover, automatically promote the most recently *uploaded* photo in that album as the new cover. If no photos remain, fall back to NULL (existing behaviour).

---

## Approach

A single correlated subquery handles both cases in one statement inside the existing transaction:

```sql
UPDATE albums
SET cover_photo_id = (
  SELECT id FROM photos
  WHERE album_id = albums.id
    AND id != :photoId
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE cover_photo_id = :photoId
```

- **Other photos exist** → subquery returns the most recently ingested photo's id → that becomes the new cover.  
- **No photos left** → subquery returns `NULL` → `cover_photo_id` is set to `NULL`.
- **Photo wasn't the cover** → `WHERE cover_photo_id = :photoId` matches nothing → no-op.

The sort key is `created_at DESC` (ingest time), which matches "last uploaded."

---

## File changed

| File | Change |
|------|--------|
| `src/server/services/photos.ts` | Replace the `UPDATE albums SET cover_photo_id = NULL` line inside `deletePhoto()`'s transaction with the correlated-subquery UPDATE above |

No other files need to change. The service function signature, the route, and the client JS are all unaffected.

---

## Verification

1. `pnpm typecheck` — clean (no type changes involved).
2. Seed or upload 2+ photos to an album; set one as cover in the DB.
3. Delete that cover photo via long-press → confirm → verify the album now shows the most recently uploaded remaining photo as its cover (check `SELECT cover_photo_id FROM albums` in sqlite3, or reload the home page and confirm the album card thumbnail changed).
4. Delete all remaining photos one by one; on the last deletion, verify `cover_photo_id IS NULL`.
5. Delete a non-cover photo — verify the cover is unchanged.
