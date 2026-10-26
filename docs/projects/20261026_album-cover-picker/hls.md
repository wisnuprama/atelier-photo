# HLS — Album cover picker

Rough high-level solution. Detailed plans go in `plans/`. Verify line numbers
with grep; the wiki (`docs/wiki/codebase/`) may have drifted.

## Approach

Reuse the existing `albums.cover_photo_id` column and `COVER_JOIN` read path
(`services/photos.ts`). Add one write function, one session route, and two UI
entry points. No schema change.

## Server

- DAO `setAlbumCover(ctx, photoId, { reset? })` in `services/photos.ts`:
  look up the photo's `album_id`, `UPDATE albums SET cover_photo_id = ? WHERE id = ?`.
  Throw 404-tagged Error if the photo is missing (same pattern as `updatePhoto`).
  Reset variant sets the column to NULL (needs the album; take `albumId` or
  the photo's album).
- Route in `routes/auth.ts` (session scope):
  `POST /admin/photos/:photoId/cover` → 204. Reset: `DELETE /admin/photos/:photoId/cover`
  or a body flag (choose one in the plan). No collision with the HMAC scope
  (`/admin/photos` exact path only). Guard with `getAdminSession`.
- Deriving the album from the photo avoids sending an album id from the client.

## Client

- `client/ts/admin.ts`: add a "Set as album cover" button to `buildMenu()`,
  bump the hard-coded `menuH` (52) so clamping still works, wire a click handler
  using the same `fetch(..., { credentials: "include" })` convention as delete.
- `views/admin-photos.ts` + `client/ts/admin-photos.ts`: add `isCover` to
  `PhotoTableRow` (DAO `listAllPhotos` joins `albums.cover_photo_id`, and should
  treat the automatic fallback separately from a pinned cover), render a marker
  and a button per row. Keep the pure-helper / DOM split.

## Risks

- `listAllPhotos` row shape changes → update CSV export/import and view tests.
- Mobile long-press menu clipping if `menuH` is not updated.
- Landscape covers are centre-cropped; accepted, out of scope.

## Testing

- DAO: pinned cover, wrong/missing photo, reset, delete-cover interplay.
- Route: 401, 404, 204 using the `auth.test.ts` harness.
- View test for the admin table marker; pure helpers for any new client logic.

## Docs to update

`docs/wiki/codebase/album-detail-page.md`, `admin-photos-page.md`,
`database.md`, `admin-auth.md` (new route).
