# Gear search page (`/search`)

Public, server-rendered list of every photo (all albums) whose camera body
and/or lens exactly match the query. Entered from `/gear` cards. Plan:
`docs/projects/20261026_gear-search/plans/search-photos-by-gear.md`.

## Route — `src/server/routes/pages.ts:49`

`GET /search?camera=…&lens=…` → `parseSearchFilters(request.query)` →
`searchPhotos(ctx, filters)` → `layout({ title: searchTitle(filters),
activeNav: "gear", body: searchPage(photos, filters) })`.

- Always 200: no filter, unknown values, and ignored params render an empty
  state.
- `searchTitle()` returns **raw** text (`FE 35mm — Still`); `layout()`
  escapes it. Do not pre-escape (the album route still does — known
  double-escape bug).
- No admin features; global rate limit only.

## Query rules — `src/server/services/search-filters.ts`

Pure module (no DB import), so views and tests can import it.

| Export | Behaviour |
| --- | --- |
| `SEARCH_KEYS` | `["camera", "lens"]` — canonical URL and chip order |
| `SEARCH_VALUE_MAX` | 200; must equal `GEAR_NAME_MAX` (asserted in the test; not imported because `services/gear.ts` imports the DB) |
| `parseSearchFilters(query)` (`:27`) | Per key: single string only (repeated keys → array → ignored), trimmed, empty or > 200 chars ignored; unknown keys ignored; non-object → `{}` |
| `hasFilters(f)` (`:42`) | Any key set |
| `searchHref(f)` (`:51`) | `URLSearchParams` in `SEARCH_KEYS` order (space → `+`, `\|` → `%7C`); `/search` when empty. The only `/search` URL builder — `gearSearchHref` in `views/gear.ts` delegates to it. Chip remove link = `searchHref({ ...filters, [key]: undefined })` |

Fastify's default query parser decodes `+` and `%7C`; malformed percent
sequences are passed through raw and simply match nothing.

## DAO — `searchPhotos` in `services/photos.ts`

`(ctx, filters) => SearchPhoto[]` (`Photo` + `albumSlug` + `albumName`).
`p.camera_body = ?` / `p.lens = ?` joined with AND (columns from the constant
`SEARCH_COLUMN` map, values bound), exact and case-sensitive (BINARY
collation, same as `/gear` grouping). Order:
`p.taken_at DESC, p.created_at DESC, p.id ASC` (undated last; id makes the
viewer order stable). No filter → `[]` without a query. Uses
`idx_photos_camera` / `idx_photos_lens` (see [database.md](database.md)).
Inactive gear stays searchable.

## View — `src/server/views/search.ts`

`searchPage(photos, filters)` (`:110`):

- Header (album-page style): `← Gear` back link, `<h1 id="searchTitle">` =
  `N Photographs` / `1 Photograph`, or `Search by gear` (no filter) /
  `No photographs` (no match).
- `filterChips()` — `<ul aria-label="Active filters">`, one link per filter
  (`aria-label="Remove filter Lens: …"`), plus "Clear all" with two filters.
  Shown in the no-match state too.
- Empty states: copy + "Browse my gear →" link to `/gear`; no grid, no
  lightbox, no `#viewer-data`.
- Results: `<section aria-labelledby="searchTitle">` → `<ul id="searchGrid">`
  with `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`; `sizes="(min-width:
  1400px) 322px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"`.
- `resultTile()` (`:80`): `<figure id="photo-{id}">` → square
  `<button class="photo-row photo-tile … aspect-square …" data-viewer-open
  data-index="i">` (thumbhash div + `object-cover` lazy img) → `<figcaption>`
  album link to `/albums/{slug}` (album top) with an `sr-only` "Album: ".
- Then `lightbox()` + `viewerDataScript(photos)` from `views/photo-viewer.ts`
  (shared with the album page).

### Viewer hook contract

Client `viewer.ts` needs, for each index `i`: the `i`-th `#viewer-data`
entry, a `[data-viewer-open][data-index=i]` inside a `figure[id^='photo-']`
(deep links), and the `i`-th `.photo-row` (scroll target on close). All three
follow the `photos` order.

`.photo-row` sits on the **button**, not the figure: the button's height
comes from `aspect-ratio`, so `content-visibility: auto` never uses the
600 px intrinsic-size fallback (`.photo-row.photo-tile { contain-intrinsic-size:
none }` in `app.css`). Tiles must not carry `data-admin-photo` (admin.ts
long-press) or `data-year` (year rail). No client JS was added.

## Adding a facet (e.g. year, album)

1. Add the key to `SearchFilters` and `SEARCH_KEYS` (parsing + URL order).
2. Add its column to `SEARCH_COLUMN` in `photos.ts` (and an index if needed).
3. Add a chip label to `FILTER_LABEL` in `views/search.ts` and adjust the
   empty-state copy.

## Tests

`services/search-filters.test.ts`, `services/photos.search.test.ts`,
`views/search.test.ts`, `views/showcase.test.ts` (snapshot of the album page
after the viewer extraction), `routes/pages.search.test.ts`. See
[testing.md](testing.md).
