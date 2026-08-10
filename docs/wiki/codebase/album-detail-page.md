# Album detail page (`/albums/:slug`)

- Route: `src/server/routes/pages.ts:33-56` →
  `showcasePage(album, photos, isAdmin)`.
- View: `src/server/views/showcase.ts` —
  `showcasePage(album, photos, isAdmin = false)` (`:163`).
- Admin strip (`:172-186`): renders when `isAdmin` — "Long-press photo to
  manage", an **Upload photos** button (`data-upload-open`), link to
  `/admin/photos`, and a `POST /admin/logout` form. Natural insertion point
  for new admin actions on this page.
- `photoRow(photo, index, isAdmin)` (`:36`) adds
  `data-admin-photo data-photo-id="…" class="photo-row select-none"` when
  admin (`:39-41`).
- Photo stream container: `#photoStream`; lightbox markup from `lightbox()`
  (`:73`); viewer payload via
  `<script type="application/json" id="viewer-data">` using `jsonScript()`
  (see [client-bundling.md](client-bundling.md)).
- Stream `<img>`s carry `data-src` (`medium`) + `data-srcset`
  (`thumb 800w, medium 1600w`) — applied by `client/ts/lazyload.ts`; the
  lightbox alone uses the `full` (2400px) variant via the viewer payload.
  `.photo-row` figures have `content-visibility: auto` (`client/css/app.css`)
  so offscreen rows aren't rendered and their decoded bitmaps can be
  discarded — keep browser memory in mind before serving bigger variants in
  the stream.

## Long-press admin menu — `src/client/ts/admin.ts` (`initAdmin()`, `:14`)

- Builds a floating menu element imperatively (`buildMenu()`, `:1`) with
  classes
  `hidden fixed z-[200] bg-paper border border-hairline shadow-lg rounded-lg py-1 min-w-[180px]`,
  `role="menu"`, appended to `document.body`.
- 600 ms `pointerdown` timer (`:81-85`), 10 px movement cancels, `contextmenu`
  opens instantly on desktop (`:100-105`), Escape + outside-pointerdown close
  (`:65-73`).
- Delete uses `confirm()` then:

```ts
const res = await fetch(`/admin/photos/${encodeURIComponent(photoId)}`, {
  method: "DELETE", credentials: "include",
});
```

(`admin.ts:116-119`), then a WAAPI fade-out + `fig.remove()` on 204;
`alert()` on failure. CSS support:
`[data-admin-photo], [data-admin-photo] * { -webkit-touch-callout: none; }` in
`src/client/css/app.css`.

## Upload modal (admin, PR #14)

When `isAdmin`, `uploadModal(album)` (`showcase.ts:138-161`) renders
`#uploadModal` (with `data-album-slug`) after the lightbox: dropzone
`#uploadDropzone` (drag-and-drop + hidden `<input type="file" multiple>`
picker, accepted types `image/{jpeg,png,webp,avif,tiff,gif}`), per-file status
list `#uploadList`, counter `#uploadCounter`, Done button `#uploadDone`.

Client: `src/client/ts/upload.ts` (`initUpload()`):

- Pure, node-testable helpers exported: `ACCEPTED_TYPES`, `MAX_FILE_BYTES`
  (60 MB), `fileError(file)`, `formatBytes(n)` — files failing `fileError`
  are shown with a red status and **never sent**.
- Uploads run through a **worker pool of `MAX_CONCURRENT_UPLOADS` (3)** —
  one `XMLHttpRequest` per file to `POST /admin/photos/upload` (`FormData`
  with `album` + `file`; `withCredentials`; `upload.onprogress` drives a
  per-row percent + 2px bar), up to 3 in flight at once so network transfer
  overlaps server-side ingest.
  Statuses: `Queued` → `Uploading N%` → `Created ✓` / `Replaced ✓` / error.
- While uploads are in flight the modal is locked (`setLocked(true)`) —
  Escape, scrim, and Done are ignored; new drops extend the running queue.
- Closing after ≥1 success calls `location.reload()` so the SSR page picks up
  the new photos/thumbhashes/year rail.

## Modal/dialog patterns

Reusable overlay helper: `src/client/ts/modal.ts` —
`createModal(root): { open, close, isOpen, setLocked }`. Follows the lightbox
conventions (`hidden` class toggle, `document.body.style.overflow` lock,
focus save/restore, Escape, Tab focus trap) and wires `[data-modal-close]`
clicks (scrim included). Used by the upload modal here and the create-album
modal on the album list page ([album-list-page.md](album-list-page.md)); the
lightbox itself (`viewer.ts`) predates it and remains standalone. Styling
recipes in [styling.md](styling.md).
