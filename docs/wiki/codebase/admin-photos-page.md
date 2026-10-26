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

- View `src/server/views/admin-photos.ts` — `adminPhotosPage(rows)` (`:101`);
  data island `<script type="application/json" id="photos-data">` (`:178`).
- Client `src/client/ts/admin-photos.ts` — pure helpers (`toRowModel`,
  `filterRows`, `paginate`, `dirtyRows`, `applyEdit`, `markSaving/Saved/Error`,
  `coverAction`, `coverFailureMessage`, `beginCoverRequest` /
  `endCoverRequest`, `applyAlbumCover`, lines 49-186) split from DOM wiring
  `initAdminPhotos()` (`:201`). **The split is deliberate** so the pure half
  is unit-testable — preserve it (see [testing.md](testing.md)).

## Album cover controls

- `coverControls(row)` (view `:23`) renders under the thumbnail in the Image
  cell (no new column): a text badge `[data-cover-badge]` ("Cover" when
  pinned, "Cover · auto" for the automatic cover, `hidden` otherwise) and a
  `[data-cover-action]` button ("Set as cover" → POST, "Reset to auto" →
  DELETE, method in `data-cover-method`), plus a hidden per-row
  `[data-cover-error]` span. The button's `aria-label` is
  `"<visible text>: <album>"` (WCAG 2.5.3 Label in Name — it starts with the
  visible text, no photo id); the view builds it inline and must stay in sync
  with the client's `coverAction(row).ariaLabel` (a view test asserts this).
  An sr-only `#photos-cover-status` live region announces results **and
  failures**.
- Client: `RowModel.coverState` mirrors `PhotoTableRow.coverState`.
  `toggleCover` (`:400`) takes a per-album lock (`beginCoverRequest`) and
  disables every cover button of that album until the request settles, so
  rapid toggles can't race. On success `applyAlbumCover` updates every row of
  that album (including hidden pages) and `reflectCover` (`:245`) patches the
  badge/button in place so keyboard focus stays on the button. Failures
  (`coverFailureMessage`) are announced via `#photos-cover-status` and shown in
  the row's `[data-cover-error]`. The cover path never writes `[data-error]` —
  that span belongs to `reflect()` (title validation / save errors) — and
  `m.state` is not touched, so autosave is unaffected. `refreshFromServer`
  (`:491`) also syncs `coverState`.

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
