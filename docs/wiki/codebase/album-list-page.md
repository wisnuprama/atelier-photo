# Album list page (`/`)

- Route: `src/server/routes/pages.ts:13-22` — `app.get("/")`, computes
  `isAdmin = getAdminSession(request)` and renders
  `albumsPage(listAlbums(ctx), getPhotoYearRange(ctx), isAdmin)`.
- View: `src/server/views/albums.ts` — `albumCard()` (`:4`) and
  `albumsPage(albums, yearRange, isAdmin = false)` (`:53`). Grid id
  `#albumGrid`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6`.
- Empty state: `"No albums yet."`.

## Admin UI (session only)

When `isAdmin`, the view adds:

- An **admin strip** between the heading and the grid (`albums.ts:68-80`):
  `Admin · New album · Manage photos · Sign out` — same styling as the album
  detail page's strip.
- The **create-album modal** `#albumCreateModal` (`albumCreateModal()`,
  `albums.ts:24-51`), appended after `</main>`: name input (required),
  optional description textarea, inline error line `#albumCreateError`,
  Cancel/Create buttons. `z-[100]`, scrim + panel, `role="dialog"`
  `aria-modal="true"`.

Client wiring: `src/client/ts/album-create.ts` (`initAlbumCreate()`) — opens
on `[data-album-create-open]`, POSTs JSON to `/admin/albums/create`
(fetch + `credentials: "include"`, no CSRF header), and on 201 redirects to
`/albums/{slug}`. Uses the shared modal helper `src/client/ts/modal.ts`
(`createModal` — focus trap, Escape, scroll lock; see
[client-bundling.md](client-bundling.md)).

Routes/auth details: [admin-auth.md](admin-auth.md). DAO functions:
`listAlbums` / `createAlbum` — see [database.md](database.md).
