# Album detail page (`/albums/:slug`)

- Route: `src/server/routes/pages.ts:32-54` →
  `showcasePage(album, photos, isAdmin)`.
- View: `src/server/views/showcase.ts` —
  `showcasePage(album, photos, isAdmin = false)` (`:137`).
- Admin strip (`:146-158`): renders when `isAdmin` — "Long-press photo to
  manage", link to `/admin/photos`, and a `POST /admin/logout` form. Natural
  insertion point for new admin actions on this page.
- `photoRow(photo, index, isAdmin)` (`:36`) adds
  `data-admin-photo data-photo-id="…" class="photo-row select-none"` when
  admin (`:39-41`).
- Photo stream container: `#photoStream` (`:172`); lightbox markup from
  `lightbox()` (`:73`); viewer payload via
  `<script type="application/json" id="viewer-data">` (`:186`) using
  `jsonScript()` (see [client-bundling.md](client-bundling.md)).

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

## Modal/dialog patterns

**There is no drag-and-drop and no reusable modal/dialog component.** The only
"modal" is the lightbox (`showcase.ts:73`, driven by `viewer.ts`:
`classList.remove("hidden")` + `document.body.style.overflow = "hidden"` +
focus save/restore at `viewer.ts:227-243`, Escape at `:290-292`). New modals
should follow the lightbox / `buildMenu` patterns; styling recipes in
[styling.md](styling.md).
