# Plan — Search photos by gear

Status: proposed · Created 2026-10-26
Source of truth: [`../prd.md`](../prd.md). Starting point: [`../hls.md`](../hls.md).
Depends on: [`../../20261026_my-gear-page/`](../../20261026_my-gear-page/).

## 1. Summary

Add a public, server-rendered page `GET /search?camera=…&lens=…`. It lists every
photo, across all albums, whose `camera_body` and/or `lens` exactly match the
query values (AND when both are given), newest taken first. The page shows:

- a back link to `/gear` and a heading with the result count
  (`24 Photographs`), in the album page's header style,
- the active filters as removable chips (plain links; "Camera" / "Lens"
  label + value + `×`),
- a grid of square thumbnails (2 / 3 / 4 columns), each tile opening the
  existing full-screen viewer (lightbox + EXIF panel) and each captioned with
  a link to its album,
- a friendly empty state with a link to `/gear` when there is no filter or no
  match (always HTTP 200).

The visual design is in §10.

No client JS is added. The existing `initViewer()`, `initLazyLoad()` and
`applyThumbHashes()` pick the page up through the same DOM hooks the album page
uses. The lightbox markup and viewer JSON payload move out of
`views/showcase.ts` into a shared module so the two pages do not copy them.

## 2. Dependency assumptions (`20261026_my-gear-page`)

What this plan assumes my-gear-page delivers:

| Item | Assumption | If it is not there yet |
| --- | --- | --- |
| Entry links | Gear cards link to `/search?camera=<name>` or `/search?lens=<name>`, with the query built by `URLSearchParams` (so spaces become `+`, `\|` becomes `%7C`, non-ASCII is percent-encoded). One param per card. | `/search` still works by direct URL. This project can ship first; it has no runtime need for the gear page. |
| URL builder | The gear page lands first and exports `gearSearchHref(kind, name)` from `src/server/views/gear.ts`. This project adds `searchHref(filters)` (§5.1) as the single URL builder, and **rewrites `gearSearchHref` to delegate**: `return searchHref({ [kind]: name })`. Keep the `gearSearchHref` name and signature so the gear view and its tests do not change. Add one test asserting `gearSearchHref("lens", x) === searchHref({ lens: x })` for a value with spaces and `\|`. (Review note, 2026-10-26: the two plans originally each owned a builder.) | If search lands first, the gear page imports `searchHref` and defines `gearSearchHref` as the same one-line wrapper. |
| Nav key | `LayoutOptions["activeNav"]` in `src/server/views/layout.ts` includes `"gear"`, and `NAV_LINKS` has `{ href: "/gear", label: "Gear", key: "gear" }`. | Add only `"gear"` to the `activeNav` union and to the `key` type of `NAV_LINKS` (no nav link). That is a one-line type change that merges cleanly with the gear page's edit. |
| Indexes | `schema.sql` contains `CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos (camera_body);` and `CREATE INDEX IF NOT EXISTS idx_photos_lens ON photos (lens);` | This project adds the **same two statements, character for character** (see §6). |
| `gear` table | Not used by search. Inactive gear is still searchable (search filters on photos, not on gear state). | n/a |

What this project adds itself: the DAO query, the filter parser and URL
builder, the route, the view, the shared viewer module, the indexes (if not
present), tests, and the wiki page.

Merge order: either order is safe. If my-gear-page lands first, the index lines
and the `"gear"` nav key already exist and this project skips them. If this
project lands first, my-gear-page's identical `IF NOT EXISTS` lines become a
no-op when they merge (remove the duplicate lines at merge time).

## 3. hls.md corrections and gaps found in the code

1. **Viewer hooks — confirmed, with one CSS problem.** `src/client/ts/viewer.ts`
   reads `#viewer-data`, wires `[data-viewer-open][data-index]`, deep-links via
   `figure[id^='photo-']` + `hashToIndex()`, and on `close()` scrolls to
   `document.querySelectorAll(".photo-row")[index]` (now ~L238, offset −90 px).
   That scroll works in a grid (it scrolls to the tile's row). **But** `.photo-row`
   in `src/client/css/app.css` (~L61) sets `content-visibility: auto;
   contain-intrinsic-size: auto 600px`. On the album page the class is on the
   `<figure>`, whose height comes from its content, so a never-rendered figure
   is treated as 600 px tall. Copying that onto a grid figure (tile + caption)
   would make unrendered rows too tall and the page would jump on scroll and on
   viewer close. **Resolution (design, §10.5/§10.7):** put `.photo-row` on the
   square `<button>` instead of the `<figure>`. Its height follows from its
   width via `aspect-ratio`, so the fallback is never consulted (the same
   mechanism `.album` relies on), and a one-rule modifier `.photo-tile` sets
   `contain-intrinsic-size: none` to make that explicit. `viewer.ts` only needs
   *an* element with `.photo-row` per index and a `figure[id^='photo-']`
   around the `[data-viewer-open]` button, both of which still hold. The
   hls.md does not mention this.
2. **Other client modules.** `src/client/ts/showcase.ts` (`initShowcase`) exits
   early without `#showcaseView` — confirmed. `src/client/ts/admin.ts`
   (`initAdmin`) binds long-press to `[data-admin-photo]`; search tiles must
   **not** emit that attribute (or `data-year`). The hls.md does not mention
   `admin.ts`.
3. **`viewerData` has no album field.** `ViewerPhoto` in `viewer.ts` and
   `viewerData()` in `showcase.ts` carry no album. Rather than change the viewer
   (shared with the album page), R5 is met with an album link on each grid tile.
   Adding the album to the EXIF panel stays optional/out of scope (see §11).
4. **Double escaping in page titles.** `routes/pages.ts` passes
   `` title: `${esc(album.name)} — Still` `` to `layout()`, and `layout()`
   escapes `title` again (`<title>${esc(title)}</title>`). An album named
   `A & B` renders as `A &amp; B` in the tab. The search route must pass the
   **raw** title. The existing album-route bug is noted, not fixed here (one-line
   follow-up).
5. **Query parsing facts (checked with Fastify 5 `inject`).** The default parser
   decodes `+` to a space and `%7C` to `|`. Repeated keys
   (`?lens=a&lens=b`) give an array. `lens[]=a` gives a key `"lens[]"` (ignored).
   Malformed percent sequences (`%E0%A4%A`) are passed through raw, not
   rejected — they simply match nothing. The hls.md parsing rules hold; the plan
   adds tests for each case.
6. **Ordering tie-break.** `ORDER BY taken_at DESC, created_at DESC` (as in
   `listPhotos`) can tie on bulk imports. Add `p.id ASC` as a final key so the
   viewer index order is stable between renders. SQLite sorts `NULL taken_at`
   last under `DESC`, which matches "newest taken first".
7. **Index shape.** A composite `(lens, taken_at)` index would serve the sort
   better, but the index **names** are shared with my-gear-page. With
   `IF NOT EXISTS`, two different definitions under one name means whichever
   runs first wins silently. Use exactly the gear page's single-column
   definitions. At this site's scale the sort of a filtered set is trivial.
8. **No pages route tests exist.** `routes/pages.ts` has no test file. This
   plan adds `routes/pages.search.test.ts` with its own config mock (needs
   `contactEmail`, `contactGreeting`, `umamiWebsiteId`, `adminHmacSecret`,
   `isProduction`, because `pages.ts` imports `layout.ts`, `contact` config,
   and `plugins/session.ts`).
9. **Wiki line numbers.** `docs/wiki/codebase/database.md` lists DAO line
   numbers that are still roughly right (`listPhotos` 238, `listAllPhotos` 249);
   update them after the insert.

## 4. Files to change

| File | Change |
| --- | --- |
| `src/server/db/schema.sql` | Add the two `CREATE INDEX IF NOT EXISTS` lines (skip if present). |
| `src/server/services/photos.ts` | Add `SearchFilters`, `SearchPhoto`, `searchPhotos(ctx, filters)` next to `listPhotos` / `listAllPhotos`; reuse private `PhotoRow` + `toPhoto`. |
| `src/server/views/gear.ts` (from my-gear-page) | Rewrite `gearSearchHref(kind, name)` body to `searchHref({ [kind]: name })`; add the equality test in `views/gear.test.ts` (§2). |
| `src/server/services/search-filters.ts` (new) | Pure helpers: `SEARCH_VALUE_MAX`, `parseSearchFilters(query)`, `searchHref(filters)`, `hasFilters(filters)`. No DB import (testable, importable by the gear view). |
| `src/server/views/photo-viewer.ts` (new) | Moved from `showcase.ts`: `lightbox()`, `viewerData(photos)`, `displayDate(iso)`; new `viewerDataScript(photos)` returning the `<script type="application/json" id="viewer-data">` tag. |
| `src/server/views/showcase.ts` | Delete the moved functions; import from `./photo-viewer.js`. Output must stay byte-for-byte the same. |
| `src/server/views/search.ts` (new) | `searchPage(photos: SearchPhoto[], filters: SearchFilters): string` and `searchTitle(filters)`, plus private `searchHeader`, `filterChips`, `resultTile`, `emptyState`. Markup and classes per §10. |
| `src/server/views/icons.ts` | Add `"arrow-right"` to the `IconName` union (empty-state link, §10.6). |
| `src/server/routes/pages.ts` | Add `GET /search` in `pageRoutes`. |
| `src/server/views/layout.ts` | Only if my-gear-page has not landed: add `"gear"` to the `activeNav` union and `NAV_LINKS` key type. |
| `src/client/css/app.css` | Add `.photo-row.photo-tile { contain-intrinsic-size: none; }` next to `.photo-row` (§10.7). |
| Tests (new) | `services/search-filters.test.ts`, `services/photos.search.test.ts` (or new `describe` in `photos.test.ts`), `views/search.test.ts`, `routes/pages.search.test.ts`. |
| Docs | `docs/wiki/codebase/search-page.md` (new), `README.md`, `directory-structure.md`, `database.md`, `testing.md`. |

No new dependencies. No client TS changes.

## 5. Step-by-step implementation

### 5.1 Filter parsing and URL building — `services/search-filters.ts`

```ts
export const SEARCH_VALUE_MAX = 200;
export interface SearchFilters { camera?: string; lens?: string }
const KEYS = ["camera", "lens"] as const; // extend here for year/album later

export function parseSearchFilters(query: unknown): SearchFilters
export function hasFilters(f: SearchFilters): boolean
export function searchHref(f: SearchFilters): string // "/search" or "/search?camera=…&lens=…"
```

Rules for `parseSearchFilters`, per key in `KEYS`:

- Not a plain object query → `{}`.
- Value not a `string` (array, undefined, object) → ignored.
- `trim()`; empty → ignored. Safe against the gear page's untrimmed links:
  ingest already trims `camera_body` and `lens` (`str()` in
  `services/exif.ts`), so stored values have no edge whitespace.
- Length > `SEARCH_VALUE_MAX` → ignored (see Open question Q3).
- Unknown keys are ignored.

`searchHref` builds with `new URLSearchParams()`, appending keys in the fixed
`KEYS` order so URLs are canonical. It returns `/search` when no filter is set.
The chip "remove" link is `searchHref({ ...filters, [key]: undefined })`.

### 5.2 DAO — `searchPhotos` in `services/photos.ts`

```ts
export interface SearchPhoto extends Photo { albumSlug: string; albumName: string }

export function searchPhotos(_ctx: Ctx, filters: SearchFilters): SearchPhoto[]
```

- Import `SearchFilters` type from `./search-filters.js`.
- No filter → return `[]` without querying.
- Build `clauses: string[]` and `params: string[]` from a fixed column map
  (`camera → p.camera_body = ?`, `lens → p.lens = ?`). Column names never come
  from input; values are bound parameters only.
- SQL:
  ```sql
  SELECT p.*, a.slug AS album_slug, a.name AS album_name
  FROM photos p JOIN albums a ON a.id = p.album_id
  WHERE <clauses joined by AND>
  ORDER BY p.taken_at DESC, p.created_at DESC, p.id ASC
  ```
- Map rows with `toPhoto(row)` plus `albumSlug` / `albumName`
  (row type `PhotoRow & { album_slug: string; album_name: string }`).
- Exact, case-sensitive match (`=` with SQLite's default BINARY collation),
  which is what the gear page groups by.

### 5.3 Shared viewer module — `views/photo-viewer.ts`

1. Move `displayDate`, `viewerData`, and `lightbox` from `showcase.ts`
   unchanged; export them. `viewerData` accepts `Photo[]` (a `SearchPhoto[]`
   is assignable).
2. Add `viewerDataScript(photos)` = the existing
   `<script type="application/json" id="viewer-data">${jsonScript(viewerData(photos))}</script>`.
3. In `showcase.ts`, import them; keep `yearOf`, `photoRow`, `yearRail`,
   `uploadModal`, `showcasePage` there.
4. Verify with a snapshot-style test that `showcasePage` output is unchanged
   (§7.4).

### 5.4 View — `views/search.ts`

`searchPage(photos, filters)` returns the structure below; the exact
classes, copy and spacing are in §10 (the view must emit those strings).

```
<main id="searchView">
  <section>                                   header (§10.3), same container as the album pages
    <a href="/gear"> ← Gear                   back link
    <h1 id="searchTitle">  "{n} Photograph(s)" — or "Search by gear" / "No photographs"
    <ul aria-label="Active filters">          only when hasFilters (§10.4)
      <li><a href="{searchHref without camera}" aria-label="Remove filter Camera: {value}">
            <span>Camera</span> <span>{value}</span> <icon x aria-hidden> </a></li>
      <li> … Lens … </li>
      <li><a href="/search">Clear all</a></li>   only when 2 filters
    </ul>
    <p> empty-state copy </p>                 only when n = 0 (§10.6)
    <a href="/gear"> Browse my gear → </a>    only when n = 0
  </section>
  <section aria-labelledby="searchTitle">     results, only when n > 0 (§10.5)
    <ul id="searchGrid">                       list semantics for count announcement
      <li>
        <figure id="photo-{id}">
          <button class="photo-row photo-tile … aspect-square …"
                  data-viewer-open data-index="{i}"
                  aria-label="View {title|Photograph} full screen">
            <div class="thumbhash" data-thumbhash="{hash}"></div>
            <img class="photo-img … object-cover" data-src="{medium}" data-srcset="{thumb} 800w, {medium} 1600w"
                 sizes="{§10.5 sizes}" decoding="async" alt="{title|Photograph}">
          </button>
          <figcaption>
            <a href="/albums/{albumSlug}"><span class="sr-only">Album: </span>{albumName}</a>
          </figcaption>
        </figure>
      </li>
    </ul>
  </section>
</main>
${lightbox()}            only when n > 0
${viewerDataScript(photos)}   only when n > 0
```

Details:

- Every string goes through `esc()`: filter values, album name/slug, title,
  thumbhash. Hrefs from `searchHref` are URL-encoded and then `esc()`-ed.
- `data-index` equals the position in `photos`, which is also the index into
  `viewerData(photos)` and into `querySelectorAll(".photo-row")` — the three
  must stay in the same order. `.photo-row` is on the **button** (one per
  photo), not the figure — see §3.1 and §10.5.
- No `style="aspect-ratio:{w}/{h}"` per tile: tiles are uniform squares
  (`aspect-square`, `object-cover`). `width`/`height` are still available if
  a later design wants native ratios (Q15).
- The album link goes to `/albums/{slug}` (album top), not `#photo-{id}`.
  Design reasoning in §10.5 and Q14. If Q14 flips, only the href changes.
- Heading copy: `n === 1 ? "1 Photograph" : "{n} Photographs"`.
- Empty states (both HTTP 200), copy per §10.6:
  - no filter: h1 "Search by gear", body "Choose a camera or a lens to see
    every photograph made with it, across all albums.", link "Browse my
    gear" to `/gear`.
  - no match: filter chips still shown, h1 "No photographs", body "Nothing
    matches this gear yet.", same link.
- No `data-admin-photo`, no `data-year`, no `#showcaseView`, no year rail.
- Omit the lightbox and JSON island when there are no results;
  `initViewer()` already returns early when `#viewer-data` or `#lightbox` is
  missing.

### 5.5 Route — `GET /search` in `routes/pages.ts`

```ts
app.get<{ Querystring: Record<string, unknown> }>("/search", async (request, reply) => {
  const ctx = ctxFromRequest(request);
  const filters = parseSearchFilters(request.query);
  const photos = searchPhotos(ctx, filters);
  const html = layout({ title: searchTitle(filters), activeNav: "gear", body: searchPage(photos, filters) });
  return reply.type("text/html").send(html);
});
```

- `searchTitle(filters)`: raw, **not** pre-escaped (see §3.4), e.g.
  `"FE 24-70mm F2.8 GM II — Still"`, `"Sony A7 IV · FE 35mm — Still"`, or
  `"Search — Still"` with no filter. Put it in `views/search.ts` and export it.
- Always 200, including unknown values and no filter.
- No admin features on this page in v1 (`getAdminSession` not called).
- Rate limiting: covered by the global `registerRateLimit` like other pages; no
  per-route config.

### 5.6 Schema

See §6. `migrate()` runs `schema.sql` on every boot (`app.ts` → `migrate()`),
and `scripts/copy-assets.js` copies it into `dist`, so no extra step.

### 5.7 CSS

Add the `.photo-row.photo-tile { contain-intrinsic-size: none; }` rule from
§10.7 next to `.photo-row` in `app.css`. `content-visibility: auto` is
inherited from `.photo-row`, so long result sets stay cheap (PRD R10, hls.md
risks). No other CSS: the grid, chips and captions are existing Tailwind
utilities and the global `:focus-visible` / reduced-motion rules.

## 6. Schema / migration / index changes

Append to `src/server/db/schema.sql`, only if the lines are not already there
from my-gear-page — and in exactly this form, so both projects agree:

```sql
-- Gear page grouping and gear search (/search?camera=…&lens=…).
CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos (camera_body);
CREATE INDEX IF NOT EXISTS idx_photos_lens   ON photos (lens);
```

- Idempotent on every boot; safe on the production volume.
- No table changes, no data backfill, no versioned migration (the project has
  none — see `database.md`).
- Verify after boot: `EXPLAIN QUERY PLAN` of the lens-only query shows
  `SEARCH p USING INDEX idx_photos_lens (lens=?)` (manual check, not a test).

## 7. Tests

Match existing patterns: vitest, explicit imports, `pool: "forks"`,
`vi.mock("../config.js")` with `paths.db = ":memory:"`, `closeDb()` + `migrate()`
in `beforeEach`.

### 7.1 `src/server/services/search-filters.test.ts` (pure, no mocks)

- `camera` only, `lens` only, both.
- Trims; whitespace-only → absent.
- Array value (`["a","b"]`) → absent; object / number → absent.
- Length exactly 200 → kept; 201 → absent.
- Unknown keys (`"lens[]"`, `q`) → ignored; `null` / non-object query → `{}`.
- `searchHref`: `{}` → `/search`; `{ lens: "17mm F4 DG DN | Contemporary 023" }`
  round-trips through `new URL(…).searchParams.get("lens")`; key order is
  `camera` then `lens`; non-ASCII round-trips.

### 7.2 DAO — `src/server/services/photos.search.test.ts`

Copy the config mock from `photos.test.ts` (the mocks for derivatives, exif,
thumbhash, sharp, and fs are needed only because `photos.ts` imports them —
copy the same block). Seed two albums and photos with direct `INSERT`s
(pattern of `insertPhoto` in `photos.test.ts`), with set `camera_body`, `lens`,
`taken_at`, `created_at`.

- camera only; lens only; both = AND (excludes a photo that matches only one).
- No filters → `[]`.
- No match → `[]`.
- Name with `|` and spaces matches exactly; different case does not match.
- Spans albums; each result has the right `albumSlug` / `albumName`.
- Order: `taken_at DESC`, `NULL taken_at` last, ties by `created_at DESC` then `id`.
- Hostile value (`"' OR 1=1 --"`) → `[]` (bound parameter).
- Index presence: `SELECT name FROM sqlite_master WHERE type='index'` contains
  `idx_photos_camera` and `idx_photos_lens`; running `migrate()` twice does not
  throw.

### 7.3 View — `src/server/views/search.test.ts` (pattern of `admin-photos.test.ts`)

- Heading: `"3 Photographs"`; `"1 Photograph"`.
- Back link `href="/gear"` in the header (both result and empty states).
- Chips: one per active filter, Camera before Lens; the kind label text
  (`Camera` / `Lens`) and the value are present; remove-href for the lens chip
  equals `searchHref({ camera })`; `aria-label="Remove filter Lens: …"`;
  "Clear all" (`href="/search"`) only with two filters.
- Viewer hooks: one `data-viewer-open` per photo, `data-index` 0..n−1 in order,
  each inside a `figure id="photo-{id}"`; the `.photo-row` elements are the
  buttons (count n, same order; the figure does **not** carry `photo-row`),
  each with `photo-tile` and `aspect-square`; `#lightbox` present, and the
  `#viewer-data` island parses to n entries in the same order.
- Tile `img` has `object-cover`, `data-src` (medium), `data-srcset`
  (`thumb 800w, medium 1600w`), a `sizes` attribute, and `alt` = title or
  `Photograph`; `data-thumbhash` present when the photo has a hash.
- No `data-admin-photo`, no `data-year`, no `showcaseView`, no inline
  `style="aspect-ratio…"`.
- Album link `href="/albums/{slug}"` (no hash) and album name text, preceded
  by the `sr-only` "Album: " span.
- Empty state (no filter): h1 "Search by gear", `href="/gear"` with "Browse my
  gear", no chips, no `#lightbox`, no `#viewer-data`.
- Empty state (no match): h1 "No photographs", chips present, `href="/gear"`,
  no `#lightbox`, no `#viewer-data`, no `#searchGrid`.
- XSS: filter value `"><script>x` and album name `<b>` appear only escaped
  (in chip text, aria-label and href), and `</script>` in a title does not break
  the JSON island (`jsonScript` escapes `<`).
- `searchTitle` returns raw text (contains `&`, not `&amp;`).

### 7.4 Showcase regression (in `views/search.test.ts` or a new `views/showcase.test.ts`)

- `showcasePage(album, photos)` still contains `#lightbox`, `#viewer-data` with
  the same JSON, and `data-viewer-open` buttons. Fills a gap listed in
  `testing.md`.

### 7.5 Route — `src/server/routes/pages.search.test.ts`

Harness: `vi.mock("../config.js")` with `config: { adminHmacSecret: "s",
isProduction: false, contactEmail: "", contactGreeting: "Hi",
umamiWebsiteId: "" }` and `paths.db = ":memory:"`; `closeDb(); migrate();`
seed rows; bare `Fastify()` + `@fastify/cookie` + `pageRoutes`; `app.inject`.

- `GET /search` → 200, empty state, link to `/gear`.
- `GET /search?lens=Unknown` → 200, empty state.
- `GET /search?` + `new URLSearchParams({ lens: "17mm F4 DG DN | Contemporary 023" })`
  → 200, matching photo ids present (proves `+` and `%7C` decoding).
- `?camera=X&lens=Y` → only the AND match.
- `?lens=a&lens=b` → treated as no lens filter (empty state), 200.
- 201-char value → ignored, 200.
- Malformed `%E0%A4%A` → 200, empty state.
- Response contains `aria-current="page"` on the Gear nav link **only if** the
  gear nav link exists (skip/adjust if search lands first).

## 8. Accessibility (PRD R9, R10; CLAUDE.md)

- Each tile is a real `<button>` (keyboard: Tab, Enter/Space) with an
  `aria-label`; the image has `alt` = title or `"Photograph"` (same rule as
  `showcase.ts` and the lightbox). Focus returns to the tile on viewer close
  (existing `lastFocused`), and `close()` scrolls the tile under the sticky
  nav (`.photo-row` is the button).
- Results in a `<ul>`, so screen readers announce the count and position.
  The `<h1>` carries the count and labels the results section
  (`aria-labelledby="searchTitle"`).
- Chips are links with explicit `aria-label="Remove filter Lens: …"` (the
  visible words are part of the name, WCAG 2.5.3); the `×` icon is
  `aria-hidden`. Filter list has `aria-label="Active filters"`.
- Album link is a separate tab stop after each tile, with visible text and a
  visually hidden "Album: " prefix; no `title` tooltips.
- Visible focus: the global `:focus-visible` outline (1.5 px ink, 3 px
  offset) on tiles, chips, back link and album links. Grid gaps are ≥ 12 px
  so the outline never hides behind a neighbouring tile; no ancestor of the
  button has `overflow: hidden`, so the outline is not clipped (§10.5).
- Colour contrast: text is `ink` or `stone` (#6b6b6b on white ≈ 5.7:1) at
  the site's existing sizes; chips use the hairline border plus text, never
  colour alone.
- Reduced motion: the only transitions are the existing `.photo-img` fade
  and `transition-colors`, both disabled by the global
  `prefers-reduced-motion` rule; the viewer honours its own flag. No new
  animation (§10.8).
- Phone width: 2 columns at < 640 px, 3 at `sm`, 4 at `lg`; `sizes` matches
  (§10.5). Chips wrap; long values truncate but stay in the `aria-label`.
- Lazy loading and thumbhash placeholders reuse `data-src` / `data-srcset` /
  `data-thumbhash`; the square crop of the placeholder matches the image.
- The Gear nav link is `aria-current="page"` (`activeNav: "gear"`).

## 9. Docs / wiki updates

- New `docs/wiki/codebase/search-page.md`: route, query rules
  (`parseSearchFilters`, 200-char cap, arrays ignored), `searchHref`, DAO
  `searchPhotos`, view structure, viewer hook contract (index order of tiles ==
  JSON island == `.photo-row`, and that `.photo-row` sits on the square button
  so `content-visibility` needs no intrinsic-size guess), grid breakpoints and
  `sizes`, how to add a new facet (add to `KEYS` + column map + chip label).
- `styling.md`: add two recipes — **Filter chip** (the §10.4 class string)
  and **Square photo tile** (`photo-row photo-tile relative block w-full
  aspect-square overflow-hidden bg-hairline` + thumbhash/img children), and
  note `.photo-row.photo-tile` next to the `.photo-row` mention.
- `docs/wiki/codebase/README.md`: add the page to the index.
- `directory-structure.md`: add `services/search-filters.ts`,
  `views/search.ts`, `views/photo-viewer.ts`.
- `database.md`: add the two indexes and `searchPhotos` row; refresh line numbers.
- `testing.md`: add the new test files; remove `views/showcase.ts` from gaps if
  §7.4 is done; note the pages-route harness config mock.
- `album-detail-page.md`: note that `lightbox()` / `viewerData()` now live in
  `views/photo-viewer.ts`.

## 10. Page design

Design pass, 2026-10-26. Everything below reuses existing tokens, utilities
and patterns; the only new CSS is the four-line rule in §10.7. Class strings
are the ones the view should emit (Tailwind scans `views/*.ts`).

### 10.1 Principles

- The page is a **room for one piece of gear**, not a search engine. It reads
  like an album page: back link, serif title, mono meta, then photographs.
- Same containers, rhythm and type as the album list (`max-w-[1400px]`,
  `px-5 sm:px-8`, `pt-12 sm:pt-16`), so moving between `/`, `/gear`,
  `/search` and `/albums/:slug` feels like walking between rooms.
- Nothing moves except the existing lazy-load fade-in. No hover transforms
  on photos, no overlays, no rounded corners (the site is square-edged; only
  floating elements are rounded).
- The layout never jumps: every tile's height is derived from its width
  (§10.7), so scrollbar, `scroll-to-tile-on-close` and deep links are exact.

### 10.2 Wireframes

Phone (< 640 px, 2 columns):

```
┌────────────────────────────────────┐
│ Still                           ≡  │  sticky nav (layout.ts)
│ WISNU PHOTOGRAPHY                  │
├────────────────────────────────────┤
│                                    │  pt-12
│ ← GEAR                             │  back link, mono 10px label
│                                    │  mt-5
│ 24 Photographs                     │  h1, serif 32px
│                                    │  mt-5
│ ┌────────────────────────────────┐ │  chips wrap (flex-wrap, gap-2)
│ │ LENS  FE 24-70mm F2.8 GM II  × │ │  hairline border, mono
│ └────────────────────────────────┘ │
│ ┌───────────────────┐              │
│ │ CAMERA  ILCE-7CM2 × │  CLEAR ALL │  "Clear all" only with 2 filters
│ └───────────────────┘              │
│                                    │  pb-8
│ ┌─────────────┐  ┌─────────────┐   │  ul#searchGrid
│ │             │  │             │   │  square tiles, gap-x-3
│ │    photo    │  │    photo    │   │
│ │             │  │             │   │
│ └─────────────┘  └─────────────┘   │
│ TOKYO NIGHTS     KYOTO             │  album link, mono 9px, mt-2
│                                    │  gap-y-6
│ ┌─────────────┐  ┌─────────────┐   │
│ │    photo    │  │    photo    │   │
│ └─────────────┘  └─────────────┘   │
│ TOKYO NIGHTS     STREETS OF…       │  truncate
│                 …                  │
├────────────────────────────────────┤
│ © 2026 WISNU PRAMADHITYA RAMADHAN  │  footer (layout.ts)
└────────────────────────────────────┘
```

Desktop (≥ 1024 px, 4 columns; ≥ 640 px is the same with 3 columns):

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Still                                              ALBUMS   GEAR   CONTACT   │  Gear is aria-current
│ WISNU PHOTOGRAPHY                                           ‾‾‾‾             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │  pt-16
│  ← GEAR                                                                      │
│                                                                              │
│  24 Photographs                                                              │  h1, serif 44px
│                                                                              │
│  ┌──────────────────────────────┐ ┌───────────────────┐                      │
│  │ LENS  FE 24-70mm F2.8 GM II × │ │ CAMERA  ILCE-7CM2 × │   CLEAR ALL        │
│  └──────────────────────────────┘ └───────────────────┘                      │
│                                                                              │  pb-10
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │  gap-x-4
│  │              │ │              │ │              │ │              │         │
│  │    photo     │ │    photo     │ │    photo     │ │    photo     │         │  ~322 px at 1400
│  │              │ │              │ │              │ │              │         │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘         │
│  TOKYO NIGHTS     TOKYO NIGHTS     KYOTO            PORTRAITS                │  mono 10px
│                                                                              │  gap-y-8
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │    photo     │ │    photo     │ │    photo     │ │    photo     │         │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘         │
│  …                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

Empty state (no filter), same header block so nothing shifts between states:

```
│  ← GEAR                                                                      │
│                                                                              │
│  Search by gear                                                              │  h1, serif
│                                                                              │
│  Choose a camera or a lens to see every photograph made with it,             │  sans 14px stone
│  across all albums.                                                          │  max-w-xl
│                                                                              │
│  BROWSE MY GEAR →                                                            │  ghost link
```

No match keeps the chips (so the visitor can drop one of two filters):

```
│  ← GEAR                                                                      │
│                                                                              │
│  No photographs                                                              │
│                                                                              │
│  ┌──────────────────────────────┐ ┌───────────────────┐                      │
│  │ LENS  FE 24-70mm F2.8 GM II × │ │ CAMERA  ILCE-7CM2 × │   CLEAR ALL        │
│  └──────────────────────────────┘ └───────────────────┘                      │
│                                                                              │
│  Nothing matches this gear yet.                                              │
│                                                                              │
│  BROWSE MY GEAR →                                                            │
```

### 10.3 Header

Mirrors the album page header (`showcase.ts`), so the `<h1>` carries the
count (PRD R8) and the chips say which gear is active (PRD R3). The gear name
is not repeated as a title: the visitor just clicked it on `/gear`, and the
chip is the control. It is the browser `<title>` (§5.5). See Q13.

```html
<section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-8 sm:pb-10">
  <a href="/gear"
     class="inline-flex items-center gap-2 -ml-[16px] font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">
    ${icon("arrow-left", { class: "w-3.5 h-3.5" })} Gear
  </a>
  <h1 id="searchTitle" class="font-serif text-[32px] sm:text-[44px] leading-tight mt-5">24 Photographs</h1>
  ${filterChips(filters)}          <!-- only when hasFilters -->
  ${emptyCopy}                     <!-- only when n === 0, see §10.6 -->
</section>
```

- Back link: byte-for-byte the album page's "← Albums" link with `/gear` and
  "Gear". The `-ml-[16px]` hang aligns the text with the title.
- Heading copy: `1 Photograph` / `{n} Photographs`; empty states use
  `Search by gear` (no filter) and `No photographs` (no match).
- No eyebrow. The back link sits where the album index puts its eyebrow.

### 10.4 Filter chips

Chips follow the EXIF panel's `dt`/`dd` pairing (mono uppercase label +
mono value), boxed with the site's hairline border. Square corners. The kind
label answers "camera or lens"; the value keeps its original case (EXIF
strings such as `FE 24-70mm F2.8 GM II` look wrong uppercased).

```html
<ul aria-label="Active filters" class="flex flex-wrap items-center gap-2 mt-5">
  <li class="max-w-full">
    <a href="${esc(searchHref({ ...filters, lens: undefined }))}"
       aria-label="Remove filter Lens: ${esc(value)}"
       class="group inline-flex items-center gap-2 max-w-full border border-hairline hover:border-ink px-3 py-1.5 font-mono transition-colors">
      <span class="text-[9px] label text-stone uppercase shrink-0">Lens</span>
      <span class="text-[12px] text-ink truncate">${esc(value)}</span>
      ${icon("x", { class: "w-3.5 h-3.5 shrink-0 text-stone group-hover:text-ink transition-colors" })}
    </a>
  </li>
  <!-- camera chip: same, label "Camera" -->
  <li><a href="/search" class="font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">Clear all</a></li>   <!-- only with 2 filters -->
</ul>
```

- Order: Camera chip, then Lens chip (the `KEYS` order), then "Clear all".
- Hover: border and `×` turn ink. Focus: global `:focus-visible` outline.
- A very long value truncates inside the chip (`truncate` + `max-w-full`);
  the full value is still in the `aria-label`.
- The `×` is decorative (`aria-hidden` via `icon()` without `label`).

### 10.5 Results grid and tiles

Grid (`<ul>` so the count is announced; `<li>` per photo):

```html
<section aria-labelledby="searchTitle" class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-24">
  <ul id="searchGrid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8">
    …tiles…
  </ul>
</section>
```

| Breakpoint | Columns | Tile edge (approx.) | Why |
| --- | --- | --- | --- |
| < 640 px | 2 | 169 px on a 390 px phone | Two-up is the widest a square can be and still show a sequence. |
| ≥ 640 px (`sm`) | 3 | 190–300 px | |
| ≥ 1024 px (`lg`) | 4 | 230–322 px (322 px at the 1400 px cap) | Four keeps tiles large; the photos stay the hero. No fifth column at `xl` (Q16). |

Gaps are ≥ 12 px, so the 1.5 px focus outline with its 3 px offset never
overlaps a neighbour.

Tile:

```html
<li>
  <figure id="photo-${esc(photo.id)}" class="flex flex-col">
    <button class="photo-row photo-tile relative block w-full aspect-square overflow-hidden bg-hairline"
            data-viewer-open data-index="${index}"
            aria-label="View ${alt} full screen">
      <div class="thumbhash absolute inset-0"${thumbAttr}></div>
      <img class="photo-img absolute inset-0 w-full h-full object-cover"
           data-src="${mediaUrl(photo.id, "medium")}"
           data-srcset="${mediaUrl(photo.id, "thumb")} 800w, ${mediaUrl(photo.id, "medium")} 1600w"
           sizes="(min-width: 1400px) 322px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
           decoding="async" alt="${alt}" />
    </button>
    <figcaption class="mt-2 min-w-0">
      <a href="/albums/${esc(photo.albumSlug)}"
         class="block truncate font-mono text-[9px] sm:text-[10px] label text-stone hover:text-ink uppercase transition-colors">
        <span class="sr-only">Album: </span>${esc(photo.albumName)}
      </a>
    </figcaption>
  </figure>
</li>
```

- **Square tiles, `object-cover`.** Results mix portrait and landscape
  frames from different albums; a uniform square is the neutral crop (both
  orientations lose the same amount), rows stay level, and the full frame is
  one tap away in the viewer. Album covers already crop to 3:4 the same way.
  See Q15.
- **`.photo-row` is on the `<button>`, not the `<figure>`.** The button is
  the aspect-ratio box, so under `content-visibility: auto` its height still
  follows from its width (same mechanism as `.album` in `app.css`), and the
  600 px fallback is never consulted. The figure also holds the caption, so
  it must not carry the class (its skipped height would be a guess). The
  viewer only needs *some* element with `.photo-row` at each index
  (`close()` scrolls to it) and a `figure[id^='photo-']` that contains the
  `[data-viewer-open]` button (deep links); both still hold. See §3.1, §10.7.
- **Thumbhash** `div.thumbhash` with `background-size: cover` crops like
  `object-cover`, so the blur-up matches the final crop. `bg-hairline` on the
  button is the no-hash fallback, as elsewhere.
- **`sizes`** matches the column widths above. At 2× DPR every breakpoint
  resolves to the 800 px `thumb`; only 3× desktops fetch `medium`. The
  `data-src`/`data-srcset` pair is the album stream's, so `lazyload.ts`
  needs no change.
- **Album link (R5)** sits under the tile as a wall label: mono, uppercase,
  stone, ink on hover, one line, truncated. It goes to the album's top
  (`/albums/{slug}`), not to `#photo-{id}`: the visitor has just seen that
  photo full screen, and a link named after the album should open the album,
  not the viewer again. See Q14.
- **Hover:** none on the photo (as in the album stream). The caption link
  uses the site's stone → ink hover. Cursor is the button default.
- **Focus:** global `:focus-visible` (1.5 px ink, 3 px offset). The outline is
  drawn outside the button, which clips only its own content, and no
  ancestor clips, so it is fully visible.

### 10.6 Empty states (PRD R6, always 200)

Both reuse the header block (§10.3) so the page does not change shape, and
put the copy where the grid would start. Copy is in the site's voice:
short, lower-key, no "Oops".

| State | `<h1>` | Body (`font-sans text-[14px] text-stone leading-relaxed mt-5 max-w-xl`) | Chips |
| --- | --- | --- | --- |
| No filter (`/search`) | `Search by gear` | `Choose a camera or a lens to see every photograph made with it, across all albums.` | none |
| No match | `No photographs` | `Nothing matches this gear yet.` | shown |

Followed by one ghost link (the 404 page's pattern, with a Lucide arrow
instead of the text arrow):

```html
<a href="/gear" class="mt-6 inline-flex items-center gap-2 font-mono text-[11px] label text-stone hover:text-ink uppercase transition-colors">
  Browse my gear ${icon("arrow-right", { class: "w-3.5 h-3.5" })}
</a>
```

`arrow-right` is added to `IconName` in `views/icons.ts` (one union member;
`lucide-static` ships it). No lightbox, no JSON island in either state.

### 10.7 CSS

One rule in `src/client/css/app.css`, next to `.photo-row`:

```css
/* Search result tiles (views/search.ts) put .photo-row on the square tile
   itself. Its height follows from its width via aspect-ratio — like .album —
   so no intrinsic-size guess is needed and the scrollbar never jumps. */
.photo-row.photo-tile {
  contain-intrinsic-size: none;
}
```

`content-visibility: auto` is kept from `.photo-row`, so off-screen tiles
still drop their decoded bitmaps (PRD R10, hls.md risks). The rule is
defensive: with `aspect-ratio` and `overflow: hidden` the fallback is unused
anyway, but `none` makes that true even if someone later removes
`overflow-hidden`, and it documents the intent. Everything else is Tailwind
utilities that already exist (`aspect-square`, `truncate`, `sr-only`,
`group-hover:*`, grid/gap utilities).

### 10.8 Motion, reduced motion

- The only motion is the existing `.photo-img` fade-in and the
  `transition-colors` on links/chips. Both are switched off by the global
  `prefers-reduced-motion` block in `app.css`; the viewer handles its own
  `reduceMotion` flag. Nothing new to gate.
- `html { scroll-behavior: smooth }` applies to chip-link navigation only as
  a full page load, so no in-page smooth scrolling is introduced. The
  viewer's close-scroll uses `behavior: "auto"`.

### 10.9 Alt text and names

| Element | Text |
| --- | --- |
| Tile `<img alt>` | `photo.title`, else `Photograph` (the viewer uses the same rule for the lightbox image, so the two agree). |
| Tile `<button aria-label>` | `View {alt} full screen` (album page rule). |
| Album link | Visible album name, prefixed with a visually hidden `Album: ` so a screen-reader user hears what the link is for. No `aria-label`, no `title`. |
| Chip | `aria-label="Remove filter {Camera\|Lens}: {value}"`; the `×` is `aria-hidden`. |
| Filter list | `aria-label="Active filters"`. |
| Results section | `aria-labelledby="searchTitle"`. |

### 10.10 What was deliberately not added

- No result-count chip in the nav, no sticky filter bar, no "sort" control.
- No hover overlay on tiles (the album card overlay exists to show the
  album's name; here the name is already the caption).
- No skeleton rows: thumbhash placeholders plus fixed-ratio tiles already
  give a stable, filled page before images arrive.
- No per-tile EXIF line (camera/lens are identical for every result by
  construction; the viewer shows the rest).

## 11. Open questions (with chosen defaults)

| # | Question | Default |
| --- | --- | --- |
| Q1 | Case/whitespace-insensitive match? PRD says "exactly match". | Exact, case-sensitive, after trimming the query only. Matches the gear page's grouping. |
| Q2 | Repeated params (`?lens=a&lens=b`): ignore, take first, or OR? | Ignore the key (hls.md). Simplest; nothing generates such URLs. |
| Q3 | Over-long value (> 200 chars): truncate, ignore, or 400? | Ignore the key, return 200. Truncation could match a different item; a 400 conflicts with "always friendly". |
| Q4 | Show album in the viewer's EXIF panel too? (hls.md: optional) | No in v1. R5 is met by the album caption link under each tile; the viewer stays unchanged for the album page. |
| Q5 | Count wording for one result. | `1 Photograph` / `N Photographs` (the album page always says "Photographs"; not changed here). |
| Q6 | Should a "list everything" view exist for `/search` with no filter? | No (PRD R6, hls.md). Empty state with link to `/gear`. |
| Q7 | Should inactive gear be searchable? | Yes. Search reads photos only; the `gear.active` flag only affects the gear page section. |
| Q8 | Pagination for large sets? | None in v1; lazy-loading + `content-visibility`. Revisit if a single lens exceeds a few hundred photos (viewer JSON grows per photo). |
| Q9 | `noindex` for search pages? | No. Only links from `/gear` exist, so the URL space is bounded. `layout()` has no head slot; add one later if needed. |
| Q10 | Which nav item is current? | `activeNav: "gear"` (hls.md). |
| Q11 | Fix the album route's double-escaped `<title>` while here? | Out of scope; record as a follow-up. Do not copy the pattern. |
| Q12 | Index definition conflict with my-gear-page. | Use the gear page's exact single-column definitions; never a different definition under the same name. |
| Q13 | (design) `<h1>` = result count with the gear name only in the chips, or `<h1>` = gear name with the count as a meta line (album-page style)? | Count as `<h1>` (§10.3). It meets R8 literally, avoids showing the name twice (title + chip), and the gear name is still the browser `<title>`. If the owner wants the name as the title, swap the `<h1>` text and move the count to a `<p class="font-mono text-[10px] label text-stone uppercase mt-3">` under it; R8 then relies on the header block rather than the `<h1>` element. |
| Q14 | (design) Album caption link target: album top (`/albums/{slug}`) or the photo (`/albums/{slug}#photo-{id}`, which opens the viewer on that photo)? | Album top (§10.5). The visitor has just seen the photo full screen; a link named after the album should open the album, not the lightbox again. The hash form positions the visitor at the photo after one Escape, which is useful in long albums — flip the href if that matters more. The plan's original choice was the hash form. |
| Q15 | (design) Square tiles with `object-cover`, or native aspect ratios? | Square (§10.5). Uniform tiles keep rows level and heights derivable (no `content-visibility` guesswork); native ratios in a CSS grid leave ragged gaps, and a justified layout needs JS. Portrait frames lose top/bottom, landscapes lose sides; the viewer shows the full frame. |
| Q16 | (design) Four columns at `lg`, or five at `xl` (≥ 1280 px)? | Four (§10.5), ~322 px tiles at the 1400 px cap. Five would drop to ~257 px and read as a contact sheet; fewer, larger tiles keep the photos the hero. Add `xl:grid-cols-5` and a `sizes` entry if the owner prefers density. |
