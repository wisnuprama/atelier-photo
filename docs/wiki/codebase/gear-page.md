# My Gear page (`/gear`)

Public page listing every camera body and lens found in the photos, split into
**In the bag** (active) and **Past companions** (inactive), each split into
**Cameras** and **Lenses**. Plan:
`docs/projects/20261026_my-gear-page/plans/my-gear-page.md`.

## Data model: derived items + a flag

- Items are **derived at query time** from distinct non-blank
  `photos.camera_body` / `photos.lens` values. Nothing is written at ingest:
  a new lens shows up on the next page load.
- The `gear(kind, name, active)` table stores only the owner's flag
  (PK `(kind, name)`). **No row ⇒ active.** Orphan rows (all photos with that
  name deleted) are ignored because the query drives from `photos`.
- Identity is the **exact EXIF string**, BINARY collation, no case folding.
  Two aliases of one physical lens (`FE 35mm F1.8` vs `FE 35mm f/1.8`) show as
  two items — accepted for v1.

## DAO — `src/server/services/gear.ts`

| Export | Notes |
| --- | --- |
| `GearKind`, `GEAR_KINDS` | `"camera" \| "lens"` |
| `GEAR_COLUMN` | `{ camera: "camera_body", lens: "lens" }` — the only source of column names in gear SQL; never interpolate request data |
| `isGearKind(v)` | type guard for request bodies / query params |
| `GEAR_NAME_MAX` | 200 (shared with gear search) |
| `listGear(ctx) => GearItem[]` | one statement (`LIST_GEAR_SQL`, `:72`). Flat list ordered by last use (`last_taken DESC`, undated last), then photo count, then name. Sample photo = latest by `taken_at DESC, created_at DESC` (not `COVER_JOIN`). Years via `getUTCFullYear()`, same as `getPhotoYearRange` |
| `setGearActive(ctx, kind, name, active)` | 400-tagged Error for blank/over-long name; 404-tagged when no photo has that value **for that kind**; upsert otherwise. Name stored untrimmed |

## Routes

- `GET /gear` — `routes/pages.ts:27`. Renders
  `gearPage(listGear(ctx), getAdminSession(request))` with
  `activeNav: "gear"`. No cache.
- `POST /admin/gear/active` — `routes/auth.ts:152` (session scope). JSON
  `{ kind, name, active: boolean }` → 204. 401 without a session (checked
  first), 400 for an invalid body / blank or long name, 404 for an unknown
  name. The name is in the body because EXIF strings contain spaces and `|`.

## View — `src/server/views/gear.ts`

- `gearPage(items, isAdmin)` (`:152`), `gearCard` (`:77`), `subGroup`,
  `gearSection`, `adminStrip`.
- Pure helpers (tested): `gearSearchHref(kind, name)`, `groupGear`,
  `formatPhotoCount`, `formatYears`, `gearMeta`, `gearYearSpan`.
- Copy constants at the top of the file (`SECTION_TITLE`, `INTRO`,
  `TOGGLE_LABEL`, `ADMIN_HINT`) — the owner's wording lives there.
- Card = `<li data-gear-item data-gear-kind data-gear-name data-gear-order>`
  containing an `<a class="gear-link group">` (square thumb, name, meta). The
  admin `<label><input type="checkbox" data-gear-toggle>` is the link's
  **next sibling**, never inside it.
- Visitors: empty sub-groups and empty sections are omitted. Admins: both
  sections and all four `<ul data-gear-list="{active|inactive}-{camera|lens}">`
  always render, each with a `<li data-gear-empty>None yet</li>` placeholder
  (`hidden` when the list has cards).
- Admin strip reuses the albums strip; `#gearStatus` (`aria-live="polite"`)
  holds the hint and doubles as the live region.
- Thumbs use `photo-img` + `data-src` + `.thumbhash`, so `initLazyLoad` and
  `applyThumbHashes` pick them up unchanged.

## Link contract with gear search (`/search`)

Cards link to `gearSearchHref(kind, name)` = `/search?camera=…` or
`/search?lens=…`, built with `URLSearchParams` (spaces → `+`, `|` → `%7C`).
Keep the name and signature: gear search rewrites the body to delegate to its
`searchHref({ [kind]: name })`. Both features share
`idx_photos_camera` / `idx_photos_lens` and `NavKey` `"gear"`.

## Client — `src/client/ts/gear.ts`

`initGear()` (`:77`) returns early unless `#gearView` has a
`[data-gear-toggle]` (inert for visitors). Delegated `change` handler:
disable checkbox → `fetch(toggleRequest(...))` → on 204 move the `<li>` into
the target list at `insertIndex(orders, order)` (keeps DAO order), sync both
lists' placeholders, write `moveMessage()` to `#gearStatus`, re-focus the
checkbox. On failure revert `checked` and `alert()`. **No animation** — if
one is added, gate it on `prefers-reduced-motion` (WAAPI ignores the CSS
rule).

CSS: `.gear-img` / `.gear-link:hover|:focus-visible .gear-img` zoom in
`src/client/css/app.css`, right after `.album-img`.
