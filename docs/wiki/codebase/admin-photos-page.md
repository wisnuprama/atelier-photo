# Admin photo-editing page (`/admin/photos`)

Added in v0.6.0 (`78dbadb`). Session-cookie auth — see
[admin-auth.md](admin-auth.md).

## Routes — `src/server/routes/auth.ts`

- `GET /admin/photos` (`:108`) — the page
- `PATCH /admin/photos/:photoId` (`:117`)
- `GET /admin/photos/export` (`:145`, JSZip)
- `POST /admin/photos/import` (`:175`, JSON `{ csv }` body,
  `bodyLimit: 16 * 1024 * 1024`)
- `DELETE /admin/photos/:photoId` (`:92`)

## View + client

- View `src/server/views/admin-photos.ts` — `adminPhotosPage(rows)` (`:83`);
  data island `<script type="application/json" id="photos-data">` (`:159`).
- Client `src/client/ts/admin-photos.ts` — pure helpers (`toRowModel`,
  `filterRows`, `paginate`, `dirtyRows`, `applyEdit`, `markSaving/Saved/Error`,
  lines 38-109) split from DOM wiring `initAdminPhotos()` (`:124`). **The
  split is deliberate** so the pure half is unit-testable — preserve it (see
  [testing.md](testing.md)).

## Fetch convention (`admin-photos.ts:210-215`)

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
`#photos-upload-btn` / `#photos-upload-input` (`admin-photos.ts:352-353`, view
`admin-photos.ts:108-112`). Result summary rendered into
`#photos-import-summary`.
