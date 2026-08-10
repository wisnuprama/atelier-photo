# Album list page (`/`)

- Route: `src/server/routes/pages.ts:13-21` — `app.get("/")`, renders
  `albumsPage(listAlbums(ctx), getPhotoYearRange(ctx))`.
- View: `src/server/views/albums.ts` — `albumCard()` (`:4`) and
  `albumsPage(albums, yearRange)` (`:23`). Grid id `#albumGrid`,
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6` (`:46`).
- Empty state: `"No albums yet."` (`albums.ts:29`).

## Admin awareness

**None.** The `/` handler never calls `getAdminSession`, and `albumsPage`
takes no `isAdmin` parameter. Any admin-only UI on this page requires adding
both — follow the pattern used by the album detail page
([album-detail-page.md](album-detail-page.md), auth details in
[admin-auth.md](admin-auth.md)).

DAO functions: `listAlbums` / `createAlbum` — see [database.md](database.md).
