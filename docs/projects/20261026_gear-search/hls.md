# HLS — Search photos by gear

## Approach

A new server-rendered page that reuses the album viewer. Filters are query
string parameters, so every result is a shareable, bookmarkable URL.

## Server

- DAO `searchPhotos(ctx, { camera?, lens? }): SearchPhoto[]` where
  `SearchPhoto = Photo & { albumSlug, albumName }`. Prepared statement with
  optional clauses (`camera_body = ?`, `lens = ?`, joined by AND),
  `JOIN albums`, `ORDER BY taken_at DESC, created_at DESC`. With no filters,
  return `[]` (no "list everything" page in v1). Backed by the
  `idx_photos_camera` / `idx_photos_lens` indexes from `my-gear-page`
  (create them in whichever project lands first; `IF NOT EXISTS` makes order safe).
- Route `GET /search` in `routes/pages.ts`. Parse `camera` / `lens` as strings,
  trim, cap length (e.g. 200 chars); ignore arrays/other types. Render with
  `layout({ title, activeNav: "gear" })` so Gear stays highlighted.

## View

- `views/search.ts`: `searchPage(photos, filters)`: heading with count, filter
  chips (each a link to the same URL minus that param), result grid, empty state.
- Layout choice: **thumbnail grid** (cross-album results suit a grid better than
  the album single-column stream). Each tile is a
  `button[data-viewer-open][data-index]` inside `figure.photo-row` with the same
  thumbhash/lazy-load markup as `showcase.ts`.
- Reuse, do not copy: export `lightbox()` and `viewerData()` from
  `views/showcase.ts` (currently module-private) or extract them to a shared
  module (e.g. `views/photo-viewer.ts`) that both pages import. `viewerData`
  should include `albumName`/link if the viewer panel shows it (optional).
- `client/ts/viewer.ts` is coupled to `#viewer-data`, `[data-viewer-open]`,
  `.photo-row`, and `figure[id^='photo-']`; the grid must keep those hooks.
  `showcase.ts` (year rail) is keyed on `#showcaseView` and does not run here.
  Verify scroll-to-photo-on-close behaviour (`viewer.ts` ~L238) works in a grid.

## Entry points

`/gear` cards link to `/search?camera=…` / `/search?lens=…`, built with
`URLSearchParams` (handles `|`, spaces, and non-ASCII). No slugs needed.

## Extensibility

Parse filters into one `SearchFilters` object so year/album facets can be added
later without changing the route shape.

## Risks

- Large result sets: one page with lazy-loaded images and `content-visibility`
  is fine at this scale; viewer payload grows per photo. Add pagination only if
  needed.
- Exact string match means aliases of the same item stay separate (see
  `my-gear-page` risks).
- Public query input → rely on prepared statements and `esc()`; add a test with
  hostile values.

## Testing

- DAO: camera only, lens only, both (AND), no match, no filters, `|` in names.
- Route: 200 for empty/unknown, param sanitising (arrays, long strings).
- View: chips, count, empty state, XSS escaping, viewer hooks present.

## Docs to update

New wiki page `docs/wiki/codebase/search-page.md`; update `README.md` index and
`directory-structure.md`.
