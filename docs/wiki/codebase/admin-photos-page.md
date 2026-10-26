# Admin photo-editing page (`/admin/photos`)

Added in v0.6.0 (`78dbadb`). Session-cookie auth — see
[admin-auth.md](admin-auth.md).

## Routes — `src/server/routes/auth.ts`

- `GET /admin/photos` (`:207`) — the page
- `PATCH /admin/photos/:photoId` (`:216`)
- `GET /admin/photos/export` (`:244`, JSZip)
- `POST /admin/photos/import` (`:274`, JSON `{ csv }` body,
  `bodyLimit: 16 * 1024 * 1024`)
- `DELETE /admin/photos/:photoId` (`:108`)
- `POST` / `DELETE /admin/photos/:photoId/cover` (`:123` / `:136`) — set /
  reset the album cover; 200 `{ albumId, coverPhotoId, pinned }`, no body (see
  [admin-auth.md](admin-auth.md))

## View + client

- View `src/server/views/admin-photos.ts` — `adminPhotosPage(rows)` (`:99`);
  data island `<script type="application/json" id="photos-data">` (`:176`).
- Client `src/client/ts/admin-photos.ts` — pure helpers (`toRowModel`,
  `filterRows`, `paginate`, `dirtyRows`, `applyEdit`, `markSaving/Saved/Error`,
  `coverAction`, `applyAlbumCover`, lines 49-148) split from DOM wiring
  `initAdminPhotos()` (`:160`). **The split is deliberate** so the pure half
  is unit-testable — preserve it (see [testing.md](testing.md)).

## Album cover controls

- `coverControls(row)` (view `:23`) renders under the thumbnail in the Image
  cell (no new column): a text badge `[data-cover-badge]` ("Cover" when
  pinned, "Cover · auto" for the automatic cover, `hidden` otherwise) and a
  `[data-cover-action]` button ("Set as cover" → POST, "Reset to auto" →
  DELETE, method in `data-cover-method`). An sr-only
  `#photos-cover-status` live region announces results.
- Client: `RowModel.coverState` mirrors `PhotoTableRow.coverState`.
  `toggleCover` (`:335`) calls the cover route, then `applyAlbumCover` updates
  every row of that album (including hidden pages) and `reflectCover`
  (`:204`) patches the badge/button in place so keyboard focus stays on the
  button. Failures go to the row's `[data-error]` span; `m.state` is not
  touched, so autosave is unaffected. `refreshFromServer` (`:430`) also syncs
  `coverState`.

## Fetch convention (the PATCH in `saveRow`)

```ts
await fetch(`/admin/photos/${encodeURIComponent(m.id)}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ title: m.title, commentary: m.commentary }),
});
```

No CSRF header — SameSite=strict cookie is the protection.

## CSV upload UI

A hidden `<input type="file">` + button click proxy, not a modal:
`#photos-upload-btn` / `#photos-upload-input` (view `admin-photos.ts:124-128`). Result summary rendered into
`#photos-import-summary`.
