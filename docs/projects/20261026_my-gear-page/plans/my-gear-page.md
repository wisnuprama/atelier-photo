# Plan — My Gear page

Status: draft · Created 2026-10-26 · Project: `20261026_my-gear-page`
Source of truth: [`../prd.md`](../prd.md). Starting point: [`../hls.md`](../hls.md).
Sibling: [`../../20261026_gear-search/`](../../20261026_gear-search/) (depends on this one).

## 1. Summary

Add a public `GET /gear` page ("My Gear") that lists every camera body and lens
found in `photos.camera_body` / `photos.lens`, derived at query time. Store only
the owner's active/inactive flag in a new `gear` table (no row ⇒ active). The
page splits into **Active** and **Inactive** sections, each split into
**Cameras** and **Lenses**. Each item shows photo count, year range, and the
most recent photo made with it, and links to `/search?camera=…` /
`/search?lens=…` (the gear-search page). Admins see a checkbox per item that
calls a new session-auth endpoint `POST /admin/gear/active` and moves the card
between sections without a reload. A **Gear** link joins the navbar (desktop
and mobile).

The HLS approach holds. The corrections below are mostly about details that
the code does differently from what the HLS assumes.

## 2. hls.md corrections (verified against the code on 2026-10-26)

1. **Mobile nav never marks the current page.** `mobileNav()` in
   `src/server/views/layout.ts` takes no `active` argument. It colours every
   link that has a `key` as `text-ink` and emits no `aria-current`. PRD R7 asks
   for "current" on desktop **and** mobile, so adding a nav entry is not
   enough. `mobileNav(active)` must use the same current logic as
   `desktopNav()`. This also fixes the existing Albums/Contact mobile links.
2. **The `activeNav` union is declared twice.** It is in
   `LayoutOptions.activeNav` (`"albums" | "contact" | null`) and again in the
   `NAV_LINKS` element type (`key?: "albums" | "contact"`). Extract a
   `type NavKey = "albums" | "gear" | "contact"` and use it in both places.
   gear-search also renders with `activeNav: "gear"`, so this type is a shared
   seam.
3. **`COVER_JOIN` has no `created_at` tie-break.** It orders by
   `p.taken_at DESC LIMIT 1` only. The HLS says "mirror COVER_JOIN" but asks
   for `taken_at DESC, created_at DESC`. Use the HLS ordering (it matches
   `listPhotos` and gear-search's result order, so the sample photo is the first
   search result). Do not copy `COVER_JOIN` literally. SQLite sorts NULL
   `taken_at` last under `DESC`, which is what we want.
4. **The global error handler turns every thrown error into an HTML 500.**
   `app.setErrorHandler` in `src/server/app.ts` ignores `statusCode`. So the
   "404-tagged Error" from `setGearActive` must be caught in the route with the
   existing `errStatus(err)` helper in `routes/auth.ts`, as
   `DELETE /admin/photos/:photoId` does. The route must also validate the body
   itself and return 400. It must not rely on a thrown error.
5. **Card link vs. admin checkbox nesting.** The HLS says cards link to search
   and contain a checkbox. An `<input>` must not sit inside an `<a>` (invalid
   HTML, and it is confusing for keyboard and screen-reader users). The card is
   an `<article>`/`<li>` that contains the link (image + name + metadata) and,
   for admins, a **sibling** `<label><input type="checkbox">` outside the link.
6. **Put the DAO in a new `services/gear.ts`.** `services/photos.ts` is 594
   lines, with many unrelated concerns. The HLS leaves this choice open.
7. **No year-range cache interaction.** `yearRangeCache` in `photos.ts` is
   unaffected because gear toggles do not change photo years. No invalidation
   is needed. (Stated here so a reviewer does not add one.)
8. **Year derivation must match `getPhotoYearRange`.** That function converts
   `taken_at` with `new Date(x).getUTCFullYear()`. `taken_at` is stored as ISO-8601
   UTC (`exif.ts` `takenAt()` → `toISOString()`; local DB shows
   `2025-10-16T09:59:09.000Z`). Compute `firstYear`/`lastYear` in TS the same
   way from `MIN(taken_at)` / `MAX(taken_at)`.
9. **Empty strings.** `exif.ts` `str()` already maps blank values to NULL. Legacy
   or seeded rows could still hold `''`, so the query excludes
   `trim(col) = ''` as well as NULL (R2 says "non-null", and this is a safe
   superset).
10. **The HLS "Docs to update" list is incomplete.** Also update
    `testing.md` (new test files) and `client-bundling.md` (new `initGear` in
    `main.ts`).
11. **WAAPI animations ignore the CSS reduced-motion rule.** `app.css`
    disables CSS `animation`/`transition` under `prefers-reduced-motion`.
    `element.animate()` (used in `client/ts/admin.ts` for delete) is not
    affected. If the gear card move uses any animation, gate it on
    `matchMedia("(prefers-reduced-motion: reduce)")`. Default: no animation.

## 3. Seams with gear-search (decisions)

- **Indexes are owned by this project.** Add them to `schema.sql` with exactly
  the names and columns that both HLS docs use:
  `idx_photos_camera ON photos (camera_body)` and
  `idx_photos_lens ON photos (lens)`. gear-search must **not** re-declare them
  with different columns. `CREATE INDEX IF NOT EXISTS` checks only the name,
  so a second definition with other columns would be silently ignored and
  could drift. If gear-search lands first, it should add these exact two
  lines, and this project then skips them. Composite `(camera_body, taken_at)`
  indexes were considered and deferred, because the data volume is tiny. Changing
  them later needs a new index name.
- **Link contract.** Query parameter names are `camera` (not `camera_body`) and
  `lens`, with the exact stored EXIF string as the value. Build the URL with
  `URLSearchParams` in one exported pure helper,
  `gearSearchHref(kind: GearKind, name: string): string` in
  `src/server/views/gear.ts`. gear-search's chip/"back to gear" logic can
  import `GearKind` from `services/gear.ts`. When gear-search lands, it adds
  `searchHref(filters)` in `services/search-filters.ts` and rewrites
  `gearSearchHref` as `searchHref({ [kind]: name })`, so there is one URL
  builder. Keep the name and signature stable for that swap.
- **Matching semantics.** Grouping here uses SQLite's default BINARY collation
  (`GROUP BY camera_body`). gear-search's exact `=` match uses the same
  collation, so every gear card's count equals its search result count.
  Neither side case-folds. gear-search trims the query value; that is safe
  because ingest already trims both columns (`str()` in `services/exif.ts`).
- **Shared types.** `services/gear.ts` exports
  `type GearKind = "camera" | "lens"` and a
  `GEAR_COLUMN: Record<GearKind, "camera_body" | "lens">` map. gear-search may
  reuse this map to build its optional `WHERE` clauses. Never interpolate user
  input as a column name.
- **Nav.** `NavKey` includes `"gear"`. gear-search passes `activeNav: "gear"`.
- **Merge order.** Ship this project first, then gear-search in the same
  release. Between the two merges on `main`, `/search` links return the 404
  page. That is acceptable on `main` but not in a tagged release (see Open
  questions).

## 4. Files to change

| File | Change |
| --- | --- |
| `src/server/db/schema.sql` | Add `gear` table + `idx_photos_camera`, `idx_photos_lens` |
| `src/server/services/gear.ts` (new) | `GearKind`, `GEAR_COLUMN`, `GearItem`, `listGear`, `setGearActive`, `isGearKind` |
| `src/server/routes/pages.ts` | Add `GET /gear` inside `pageRoutes` |
| `src/server/routes/auth.ts` | Add `POST /gear/active` inside `authRoutes` (mounted at `/admin`) |
| `src/server/views/gear.ts` (new) | `gearPage(items, isAdmin)`, `gearSearchHref()`, card/section helpers |
| `src/server/views/layout.ts` | `NavKey` type, Gear entry in `NAV_LINKS`, `mobileNav(active)` fix |
| `src/client/ts/gear.ts` (new) | `initGear()` + pure helpers |
| `src/client/ts/main.ts` | Import and call `initGear()` in `init()` |
| `src/client/css/app.css` | `.gear-img` / `.gear-link:hover` zoom rules (3 lines, §10.11) |
| Tests (new) | `services/gear.test.ts`, `routes/auth.gear.test.ts`, `routes/pages.gear.test.ts`, `views/gear.test.ts`, `views/layout.test.ts`, `client/ts/gear.test.ts` |
| Wiki | see §9 |

No change to `services/photos.ts`, `exif.ts`, or the ingest path. New gear
appears automatically because it is derived from `photos`. A missing `gear`
row means active (PRD acceptance: "new lens appears under Active without
admin action").

## 5. Schema / migration / indexes

Append to `src/server/db/schema.sql` (applied on every boot by `migrate()` in
`src/server/db/migrate.ts`. It is additive and idempotent, and safe on the
production volume):

```sql
-- Owner's active/inactive flag per gear item. Items themselves are derived
-- from photos.camera_body / photos.lens; no row means active.
CREATE TABLE IF NOT EXISTS gear (
  kind   TEXT NOT NULL CHECK (kind IN ('camera', 'lens')),
  name   TEXT NOT NULL,              -- exact EXIF string as stored on photos
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  PRIMARY KEY (kind, name)
);

-- Gear grouping (/gear) and exact-match gear search (/search).
CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos (camera_body);
CREATE INDEX IF NOT EXISTS idx_photos_lens   ON photos (lens);
```

- There is no backfill and no ingest hook. Orphan `gear` rows (all photos for
  that name deleted) are ignored, because the query drives from `photos`. If
  photos with that name come back later, the old flag applies again. That is
  acceptable and arguably correct.
- No FK to photos is possible (the name is not a key), and none is needed.

## 6. Step-by-step implementation

### Step 1 — Schema
Add the SQL above. Run `pnpm db:migrate` locally to confirm that it applies
on the existing `data/gallery.db`.

### Step 2 — DAO `src/server/services/gear.ts`

```ts
export type GearKind = "camera" | "lens";
export const GEAR_KINDS: readonly GearKind[] = ["camera", "lens"];
export const GEAR_COLUMN = { camera: "camera_body", lens: "lens" } as const;
export function isGearKind(v: unknown): v is GearKind;

export interface GearItem {
  kind: GearKind;
  name: string;
  active: boolean;
  photoCount: number;
  firstYear: number | null;   // UTC year of MIN(taken_at); null if no dated photos
  lastYear: number | null;
  sample: { id: string; width: number; height: number; thumbhash: string | null; title: string | null };
}

export function listGear(_ctx: Ctx): GearItem[];
export function setGearActive(_ctx: Ctx, kind: GearKind, name: string, active: boolean): void;
```

`listGear`: one prepared statement. Build the per-kind branch from
`GEAR_COLUMN` (constants only, never request data):

```sql
WITH items AS (
  SELECT 'camera' AS kind, camera_body AS name, COUNT(*) AS photo_count,
         MIN(taken_at) AS first_taken, MAX(taken_at) AS last_taken,
         (SELECT p.id FROM photos p WHERE p.camera_body = ph.camera_body
            ORDER BY p.taken_at DESC, p.created_at DESC LIMIT 1) AS sample_id
    FROM photos ph
   WHERE camera_body IS NOT NULL AND trim(camera_body) <> ''
   GROUP BY camera_body
  UNION ALL
  SELECT 'lens', lens, COUNT(*), MIN(taken_at), MAX(taken_at),
         (SELECT p.id FROM photos p WHERE p.lens = ph.lens
            ORDER BY p.taken_at DESC, p.created_at DESC LIMIT 1)
    FROM photos ph
   WHERE lens IS NOT NULL AND trim(lens) <> ''
   GROUP BY lens
)
SELECT i.kind, i.name, i.photo_count, i.first_taken, i.last_taken,
       COALESCE(g.active, 1) AS active,
       s.id AS sample_id, s.width AS sample_width, s.height AS sample_height,
       s.thumbhash AS sample_thumbhash, s.title AS sample_title
  FROM items i
  LEFT JOIN gear g   ON g.kind = i.kind AND g.name = i.name
  JOIN photos s      ON s.id = i.sample_id
 ORDER BY i.last_taken IS NULL, i.last_taken DESC, i.photo_count DESC, i.name ASC
```

- Map rows to `GearItem` with a `toGearItem(row)` helper, following the
  `toAlbumWithCover` style. Years come from
  `new Date(x).getUTCFullYear()`, with `null` when the timestamp is null or invalid.
- Default order inside each section: most recently used first, then by photo
  count, then by name (see Open questions).
- The view does the grouping into active/inactive × camera/lens. The DAO
  returns a flat list, which keeps it easy to test.

`setGearActive`:
1. If `name.trim()` is empty, or `name` is longer than `GEAR_NAME_MAX = 200`
   (the same cap gear-search uses), throw a 400-tagged Error. Keep the
   untrimmed `name` for steps 2 and 3.
2. Check that the name exists:
   `SELECT 1 FROM photos WHERE <GEAR_COLUMN[kind]> = ? LIMIT 1`. If missing,
   throw a 404-tagged Error ("Gear not found").
3. Upsert:
   `INSERT INTO gear (kind, name, active) VALUES (?, ?, ?)
    ON CONFLICT(kind, name) DO UPDATE SET active = excluded.active`
   with `active ? 1 : 0`.

The name is stored exactly as received, so it matches the `photos` value
byte for byte. Trimming is used only for the emptiness test.

### Step 3 — Toggle route in `src/server/routes/auth.ts`
Inside `authRoutes` (prefix `/admin`), add the route next to the other session
routes. Path `/gear/active`. There is no collision with the HMAC scope
(`routes/admin.ts` only claims `POST /albums` and `POST /photos`).

```ts
app.post<{ Body: { kind?: unknown; name?: unknown; active?: unknown } }>(
  "/gear/active",
  async (request, reply) => {
    if (!getAdminSession(request)) return reply.code(401).send({ error: "Unauthorized" });
    const { kind, name, active } = request.body ?? {};
    if (!isGearKind(kind) || typeof name !== "string" || typeof active !== "boolean") {
      return reply.code(400).send({ error: "Invalid body" });
    }
    try {
      setGearActive(ctxFromRequest(request), kind, name, active);
      return reply.code(204).send();
    } catch (err) {
      const status = errStatus(err);
      if (status === 400 || status === 404) return reply.code(status).send({ error: (err as Error).message });
      throw err;
    }
  },
);
```

- The JSON body carries the name, because EXIF strings contain spaces and `|`.
- There is no CSRF token, by convention (SameSite=strict cookie, see
  `admin-auth.md`).
- The auth check comes first, so unauthenticated callers get 401 even with a
  bad body.

### Step 4 — Page route in `src/server/routes/pages.ts`
Inside `pageRoutes`, add:

```ts
app.get("/gear", async (request, reply) => {
  const ctx = ctxFromRequest(request);
  const isAdmin = getAdminSession(request);
  const html = layout({ title: "My Gear — Still", activeNav: "gear", body: gearPage(listGear(ctx), isAdmin) });
  return reply.type("text/html").send(html);
});
```

Do not cache. The page reads the database on each request, which is negligible
at this scale.

### Step 5 — Layout `src/server/views/layout.ts`
- `export type NavKey = "albums" | "gear" | "contact";`
- `LayoutOptions.activeNav?: NavKey | null`. `NAV_LINKS` key type is `NavKey`.
- `NAV_LINKS`: Albums, **Gear** (`/gear`, key `gear`), Contact.
- Change `mobileNav()` to `mobileNav(active)`. It uses the same `current`
  computation as `desktopNav` and emits `aria-current="page"` on the current
  link. Classes: current link `text-left text-ink`, every other link
  `text-left text-stone` (no hover classes in the touch menu; see §10.10).
- Call it as `${mobileNav(activeNav)}`.

### Step 6 — View `src/server/views/gear.ts`
Export `gearPage(items: GearItem[], isAdmin: boolean): string` and
`gearSearchHref(kind, name)`.

The full markup, classes, and copy are in §10.4; this step lists the
contract and the helpers.

- Structure: `<main id="gearView">` → hero section (eyebrow, `<h1>My Gear</h1>`,
  serif-italic intro) → admin strip (admin only, contains `#gearStatus`) →
  sections wrapper → `<section data-gear-section="active"
  aria-labelledby="gear-active-title">` ("In the bag") and
  `<section data-gear-section="inactive" …>` ("Past companions"), each with
  **Cameras** and **Lenses** sub-groups (`<h3>` +
  `<ul data-gear-list="active-camera" aria-labelledby=…>` and so on).
- Card `<li data-gear-item data-gear-kind data-gear-name data-gear-order>`:
  an `<a class="gear-link group block" href="${gearSearchHref(kind, name)}">`
  with the square thumb frame (`thumbhash` div + `img.gear-img.photo-img`
  with `data-src="${mediaUrl(sample.id, "thumb")}"`, `width`/`height`,
  `decoding="async"`), the serif-italic name, and the mono meta line. The
  `albums.ts` lazy-load/thumbhash conventions mean `initLazyLoad` and
  `applyThumbHashes` pick the cards up with no client change.
- `data-gear-order` is the item's index in the DAO list (used by the client
  to re-insert a moved card in order, §10.7).
- Admin only, **outside** the `<a>`, as the next sibling:
  `<label …><input type="checkbox" data-gear-toggle ${active ? "checked" : ""} …>
  <span>In use<span class="sr-only"> — ${esc(name)}</span></span></label>`.
- Admin only: the admin strip from `albumsPage` with the hint in the slot
  where `showcasePage` puts "Long-press photo to manage". The hint element is
  `<span id="gearStatus" aria-live="polite">` and doubles as the live region
  (§10.7). No separate status element.
- Empty states (R9, §10.6):
  - No items at all: one `<p>` in place of the sections wrapper content,
    `No gear yet.` (+ ` Upload a photo with EXIF and it appears here.` for
    admins). No strip hint, no lists.
  - Visitor: omit any empty sub-group and any empty section.
  - Admin: **always render both sections and all four lists**; each list
    starts with `<li data-gear-empty class="hidden …">None yet</li>`, with
    `hidden` dropped when the list is empty, so the client always has a
    destination to move cards into and a placeholder to toggle.
- Alt text (R10, §10.9): `sample.title` when set, else `Sample photograph`.
  The item name is the next text inside the same link, so it is not repeated
  in the `alt`.
- `esc()` every interpolated string, including the `data-gear-name`
  attribute. `gearSearchHref` output is also passed through `esc()` (it goes in
  an attribute, and `&` must become `&amp;`).
- Pure helpers (exported for tests):
  - `groupGear(items) => { active: { camera, lens }, inactive: { camera, lens } }`,
    which keeps the DAO order.
  - `formatPhotoCount(n)`, `formatYears(first, last)`, `gearYearSpan(items)`
    (§10.3).

### Step 7 — Client `src/client/ts/gear.ts`
Split pure helpers from DOM wiring (convention from `admin-photos.ts`):

- Pure helpers:
  - `toggleRequest(kind, name, active): { url: string; init: RequestInit }`.
    It builds the `POST /admin/gear/active` request with a JSON body and
    `credentials: "include"`.
  - `targetListKey(kind, active): string`, returning `"active-lens"` and so on.
  - `moveMessage(name, active): string`, the live-region text, for example
    `"FE 24-70mm F2.8 GM II moved to In the bag"` /
    `"… moved to Past companions"` (same words as the section headings).
  - `insertIndex(orders: number[], order: number): number`, the position
    at which a card with `order` belongs among the target list's existing
    `data-gear-order` values (first index with a greater value, else
    `orders.length`).
- `initGear()`: return early unless `[data-gear-toggle]` exists (inert for
  visitors). Use event delegation on `#gearView` for `change`:
  1. Read the kind and name from the closest `[data-gear-item]`. Disable the
     checkbox while the request is in flight.
  2. `fetch` with `toggleRequest(...)`.
  3. On 204: move the `<li>` into `[data-gear-list="${targetListKey}"]` at
     `insertIndex(...)` (before the matching `[data-gear-item]` sibling, or
     appended). Toggle `hidden` on the `[data-gear-empty]` placeholders of
     the source and target lists. Re-focus the checkbox (moving a node drops
     focus; `focus()` also scrolls the card into view). Write `moveMessage`
     into `#gearStatus` (`textContent`, replacing the hint). No animation
     (§10.7). If one is added later, gate it on `prefers-reduced-motion`.
  4. On a non-204 response or a network error: revert `checked`, re-enable,
     and `alert()` with the same wording style as `admin.ts`
     (`Update failed (${status})` / `Update failed — check your connection.`).
- Register it in `src/client/ts/main.ts` (`import { initGear } from "./gear.js"`,
  then call `initGear()` in `init()`).

No-JS admin fallback: none. The admin UI already requires JS
(`admin.ts`, `admin-photos.ts`). Visitors need no JS beyond lazy-loading.

### Step 8 — Verify
`pnpm typecheck`, `pnpm lint`, `pnpm fmt`, `pnpm test`, and `pnpm build`.
Then use `pnpm dev` to check these by hand: as a visitor (no checkbox, links
work once `/search` exists) and as an admin (toggle, move, reload persists,
focus is kept, screen-reader announcement). Also check the mobile menu
`aria-current`. Before finalising the copy, check the production EXIF strings
(the local DB has three photos).

## 7. Tests (Vitest, `pool: "forks"`, explicit imports)

**`src/server/services/gear.test.ts`**. Uses the `photos.test.ts` pattern:
`vi.mock("../config.js")` with `paths.db = ":memory:"`, `closeDb()` +
`migrate()` in `beforeEach`, and photos inserted with raw SQL (no ingest
mocks needed).
- Groups distinct camera and lens values. Counts are correct.
- NULL and `''` camera/lens values are excluded.
- With no `gear` row the item is active. A toggle upsert flips it, and a
  second toggle flips it back (one row, updated in place).
- `firstYear`/`lastYear` come from MIN/MAX `taken_at` in UTC. Both are null
  when every photo is undated. A single year gives equal values.
- The sample is the latest by `taken_at DESC, created_at DESC`. Undated photos
  lose to dated ones, and `created_at` breaks ties.
- Names with `|`, spaces, and non-ASCII characters round-trip exactly. Case
  variants stay separate items.
- `setGearActive`: 404 for an unknown name, 400 for a blank or over-long name,
  and the same name under the other kind is a 404 (kind-scoped).
- An orphan `gear` row (no photos) is not listed.

**`src/server/routes/auth.gear.test.ts`**. Uses the `auth.upload.test.ts`
harness: config mock **including `ingestConcurrency`**, bare `Fastify()` +
`@fastify/cookie` + `authRoutes` at `/admin`, and `signIn()`.
- 401 without a session (even with a valid body).
- 400 for a bad `kind`, a non-string `name`, a non-boolean `active`, or a
  missing body.
- 404 for an unknown name.
- 204 on success, after which `listGear` reflects the change.

**`src/server/routes/pages.gear.test.ts`**. Registers `pageRoutes` +
`authRoutes` (for `signIn`). Mock config with `contactEmail`/`contactGreeting`
plus the `auth.test.ts` keys.
- `GET /gear` returns 200 HTML with `<title>My Gear — Still</title>`.
- The visitor HTML has no `data-gear-toggle` and no `#gearStatus`. The admin
  HTML has one toggle per item and the strip with `#gearStatus`.
- An item toggled inactive renders under `data-gear-section="inactive"`.

**`src/server/views/gear.test.ts`**. Pure render, using the
`admin-photos.test.ts` style.
- Active and inactive split, with camera and lens sub-groups. Each `<ul>`
  has `aria-labelledby` pointing at its `<h3>`.
- Admin checkbox only when `isAdmin`. `checked` mirrors `active`. The
  checkbox is not inside the `<a>` (it is the `<a>`'s next sibling). Its
  label contains the item name (in the `sr-only` span).
- Admin strip present only when `isAdmin`, with `#gearStatus` carrying
  `aria-live="polite"` and the hint text. Visitor HTML has no `#gearStatus`.
- Inactive section and empty sub-groups omitted for visitors. For admins all
  four lists are present; an empty list's `[data-gear-empty]` lacks `hidden`,
  a non-empty list's has it.
- `data-gear-order` equals the item's index in the input array.
- Empty-state message when there are no items; admin variant includes the
  upload sentence, visitor variant does not.
- Alt text: `title` when set, else `Sample photograph`; the name is not
  repeated in `alt`.
- XSS: a name like `<img onerror=x>"'&` is escaped in the text, `data-gear-name`,
  the `sr-only` label, and `href`.
- `gearSearchHref("lens", "17mm F4 DG DN | Contemporary 023")` →
  `/search?lens=17mm+F4+DG+DN+%7C+Contemporary+023`, and round-trips
  through `new URLSearchParams`.
- `formatPhotoCount` (1 / n), `formatYears` (range, single year, none), and
  the meta line omits ` · ` when there are no years.
- `gearYearSpan`: min/max across items, nulls ignored, `null` when no item is
  dated; eyebrow omits the ` · years` suffix in that case.

**`src/server/views/layout.test.ts`** (new, layout is currently untested)
- The Gear link is present in both the desktop and the mobile nav.
- `activeNav: "gear"` gives `aria-current="page"` on the Gear link in **both**
  navs and on no other link. This guards correction 1.

**`src/client/ts/gear.test.ts`**. Pure helpers only (node environment, no DOM).
- `toggleRequest` gives the URL, method, JSON body, and `credentials`.
- `targetListKey` and `moveMessage` (both section names).
- `insertIndex`: empty list → 0; smaller than all → 0; between → the first
  greater index; larger than all → length.

## 8. Accessibility (R10)

- Each checkbox is a real `<input type="checkbox">` with a `<label>`. Its
  accessible name is "In use — <item name>" (visible text + `sr-only` span).
  It works with Space by keyboard. Focus stays on it after the card moves,
  and `focus()` scrolls the moved card into view.
- Moves are announced through `#gearStatus` (`aria-live="polite"`, admin
  only), which also holds the hint text at load.
- Visible focus comes from the global `:focus-visible` rule in `app.css`
  (1.5 px ink outline, 3 px offset) around the whole card link, and around
  the checkbox. The card link and the checkbox are separate tab stops. Hover
  and focus both trigger the image zoom, so keyboard users get the same
  feedback as pointer users.
- Heading order: `h1` My Gear, then `h2` per section, then `h3` Cameras / Lenses.
  Sections use `aria-labelledby` (their `h2`); lists use `aria-labelledby`
  (their `h3`).
- Lists are `<ul>`/`<li>`, so counts are announced. The admin-only
  `[data-gear-empty]` placeholder is a real `<li>` with text, so an empty
  list reads "None yet" rather than "0 items".
- `alt` text is the photo title or `Sample photograph`; the item name
  follows as link text, so nothing is read twice (§10.9).
- Contrast: name is ink on paper; meta line is `stone` (#6b6b6b) on paper,
  the same ratio as every other mono label on the site. The `text-stone/60`
  hint in the admin strip matches the existing showcase strip hint and is
  admin-only.
- Touch targets: the card link is the full card. The checkbox hit area is
  the whole `<label>` (icon + "In use" text), roughly 60 × 20 px; the
  surrounding `gap-y-8` keeps neighbouring cards' labels apart.
- Reduced motion: no move animation. Image zoom, meta colour, and lazy-load
  fade-in are all CSS transitions already disabled by the existing
  `prefers-reduced-motion` rule, which also sets `scroll-behavior: auto` for
  the post-move `focus()` scroll.
- Nav: `aria-current="page"` on Gear in both the desktop and the mobile menu.

## 9. Docs / wiki updates

- **New** `docs/wiki/codebase/gear-page.md`: route, DAO, data model
  ("derived + flag" with no row ⇒ active), toggle endpoint, client module,
  admin-only markup, link contract with `/search`, and known EXIF alias risk.
- `database.md`: the `gear` table, the two indexes, and a new
  `services/gear.ts` DAO table (`listGear`, `setGearActive`, `isGearKind`,
  `GEAR_COLUMN`).
- `directory-structure.md`: `services/gear.ts`, `views/gear.ts`, and
  `client/ts/gear.ts`.
- `admin-auth.md`: `POST /admin/gear/active` in the session routes list and
  the guard grep list. Also update "Admin detection in views" to include `/gear`.
- `client-bundling.md`: `initGear` in `main.ts`.
- `testing.md`: the new test files in the table. Remove `layout.ts` from the
  gaps if it is listed there.
- `README.md` (wiki index): link `gear-page.md`.

## 10. Page design

Design pass, 2026-10-26. Everything below reuses the album-list page's
vocabulary (`views/albums.ts`, `views/showcase.ts`, `app.css` tokens). No new
tokens, no new icons, no new dependencies. Three lines of CSS are added (§10.11).

### 10.1 Principles

- **Same skeleton as the album list.** `max-w-[1400px] mx-auto px-5 sm:px-8`
  container, mono eyebrow + serif `h1` hero, mono "wall labels" over hairline
  rules, the existing admin strip. A visitor should not be able to tell the
  gear page was designed on a different day from the albums page.
- **One photo per card, the rest is type.** The sample photo is the only image.
  The card is a square photo, an italic serif name, and one mono line. No
  borders, no shadows, no badges, no icons.
- **Admin controls are typographic.** The checkbox sits under the card text as
  a mono label, never as an overlay on the photo. The hint and the live
  announcement share one line in the admin strip.
- **The whole card is the link.** Hover/focus feedback is the same slow zoom
  as album covers plus the meta line darkening from `stone` to `ink`. That is
  the only "link affordance"; an arrow icon would be noise on a page of twelve
  cards.

### 10.2 Layout and breakpoints

| Breakpoint | Grid (per sub-group) | Card width (approx.) |
| --- | --- | --- |
| `< 640px` | `grid-cols-2`, `gap-x-4 gap-y-8` | 155 px at a 375 px viewport |
| `sm` (640+) | `grid-cols-3`, `gap-x-6 gap-y-10` | 190–300 px |
| `lg` (1024+) | `grid-cols-4` | 230–310 px (310 px at the 1400 px max) |

Class string for every list: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4
gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10`. Cards are deliberately smaller than
album covers (3 columns, 3:4) because this is an index of tools, not the work.
A sub-group with two cameras in a four-column grid leaves two empty cells.
That is fine; the album grid does the same with a short list.

Vertical rhythm (top to bottom):

- Hero section: `pt-14 sm:pt-20 pb-6` (identical to `albumsPage`).
- Admin strip (admin only): `pb-4` (identical to `albumsPage`).
- Sections wrapper: `max-w-[1400px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-24
  flex flex-col gap-14 sm:gap-20`. The `gap` separates **In the bag** from
  **Past companions**.
- Inside a section: `h2`, then each sub-group as `<div class="mt-8">`
  (`h3` + `ul class="… mt-5"`).

The thumbnail is square: `aspect-square` with `object-cover`. Samples are a
mix of portrait and landscape; a square crop keeps the grid even without
favouring either (see Open question 10).

### 10.3 Typography and classes

| Element | Classes | Notes |
| --- | --- | --- |
| Eyebrow | `font-mono text-[10px] label text-stone uppercase` | `Cameras &amp; Lenses · 2021—2026`. Year span is min/max over all items; omit ` · …` when no item is dated. |
| `h1` | `font-serif text-[34px] sm:text-[46px] leading-[1.05] mt-3` | "My Gear" (R8). |
| Intro | `font-serif italic text-[19px] sm:text-[22px] leading-snug text-stone mt-4 max-w-xl` | One sentence, owner's copy. |
| Section `h2` | `font-serif text-[26px] sm:text-[30px] leading-tight` | "In the bag" / "Past companions". |
| Sub-group `h3` | `font-mono text-[10px] label text-stone uppercase pb-3 border-b border-hairline` | "Cameras" / "Lenses". The hairline rule is the only divider on the page. |
| Card link | `gear-link group block` | Whole card. Global `:focus-visible` outline wraps image + text. |
| Thumb frame | `relative aspect-square overflow-hidden bg-hairline` | `bg-hairline` is the pre-thumbhash placeholder, as on album covers. |
| Thumb image | `gear-img photo-img absolute inset-0 w-full h-full object-cover` | `photo-img` + `data-src` gives lazy load and fade-in for free. |
| Name | `font-serif italic text-[18px] sm:text-[20px] leading-[1.2] mt-3 text-balance` | Raw EXIF string. `text-balance` keeps two-line names even. |
| Meta line | `font-mono text-[10px] label text-stone uppercase mt-1.5 transition-colors group-hover:text-ink` | `42 photographs · 2024—2026`. Lower-case source, upper-cased by CSS. |
| Checkbox label (admin) | `mt-2.5 inline-flex items-center gap-2 font-mono text-[10px] label text-stone uppercase cursor-pointer select-none transition-colors hover:text-ink` | Sibling of the link, never inside it. |
| Checkbox input (admin) | `accent-ink w-3.5 h-3.5 cursor-pointer disabled:cursor-wait` | Native control; `accent-ink` makes the tick ink-on-paper on every platform. |
| Empty placeholder `li` | `col-span-full font-mono text-[10px] label text-stone/60 uppercase` | "None yet". |
| Page empty state | `font-mono text-[11px] label text-stone uppercase` | Same as "No albums yet." |

Meta line formatting (pure helpers in `views/gear.ts`, exported for tests):

- `formatPhotoCount(n)`: `1 photograph`, `42 photographs`.
- `formatYears(first, last)`: `2024—2026` (em dash, as `albumsPage`), `2025`
  when equal, `""` when either is null.
- The ` · ` separator is emitted only when `formatYears` is non-empty.
- `gearYearSpan(items)`: min `firstYear` / max `lastYear` over all items, or
  `null`; feeds the eyebrow.

### 10.4 Markup

Full structure for `gearPage(items, isAdmin)`. This supersedes the sketch in
Step 6; the `data-*` hooks are the contract with `client/ts/gear.ts`.

```html
<main id="gearView">
  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-6">
    <p class="font-mono text-[10px] label text-stone uppercase">Cameras &amp; Lenses · 2021—2026</p>
    <h1 class="font-serif text-[34px] sm:text-[46px] leading-[1.05] mt-3">My Gear</h1>
    <p class="font-serif italic text-[19px] sm:text-[22px] leading-snug text-stone mt-4 max-w-xl">
      The cameras and lenses behind the photographs.
    </p>
  </section>

  <!-- admin only: same strip as albumsPage / showcasePage -->
  <div class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-4 flex flex-wrap items-center gap-3">
    <span class="font-mono text-[9px] label text-stone uppercase tracking-widest">Admin</span>
    <span class="font-mono text-[9px] label text-stone/40">·</span>
    <span id="gearStatus" aria-live="polite" class="font-mono text-[9px] label text-stone/60">Tick “In use” to keep an item in the bag</span>
    <span class="font-mono text-[9px] label text-stone/40">·</span>
    <a href="/admin/photos" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Manage photos</a>
    <span class="font-mono text-[9px] label text-stone/40 ml-auto">·</span>
    <form method="POST" action="/admin/logout" class="inline">
      <button type="submit" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Sign out</button>
    </form>
  </div>

  <div class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-24 flex flex-col gap-14 sm:gap-20">

    <section aria-labelledby="gear-active-title" data-gear-section="active">
      <h2 id="gear-active-title" class="font-serif text-[26px] sm:text-[30px] leading-tight">In the bag</h2>

      <div class="mt-8">
        <h3 id="gear-active-camera-title" class="font-mono text-[10px] label text-stone uppercase pb-3 border-b border-hairline">Cameras</h3>
        <ul aria-labelledby="gear-active-camera-title" data-gear-list="active-camera"
            class="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
          <li data-gear-empty class="hidden col-span-full font-mono text-[10px] label text-stone/60 uppercase">None yet</li>

          <li data-gear-item data-gear-kind="camera" data-gear-name="SONY ILCE-7CM2" data-gear-order="0">
            <a class="gear-link group block" href="/search?camera=SONY+ILCE-7CM2">
              <div class="relative aspect-square overflow-hidden bg-hairline">
                <div class="thumbhash absolute inset-0" data-thumbhash="…"></div>
                <img class="gear-img photo-img absolute inset-0 w-full h-full object-cover"
                     data-src="/media/<id>/thumb" width="800" height="533" decoding="async"
                     alt="Sample photograph" />
              </div>
              <p class="font-serif italic text-[18px] sm:text-[20px] leading-[1.2] mt-3 text-balance">SONY ILCE-7CM2</p>
              <p class="font-mono text-[10px] label text-stone uppercase mt-1.5 transition-colors group-hover:text-ink">42 photographs · 2024—2026</p>
            </a>
            <!-- admin only -->
            <label class="mt-2.5 inline-flex items-center gap-2 font-mono text-[10px] label text-stone uppercase cursor-pointer select-none transition-colors hover:text-ink">
              <input type="checkbox" data-gear-toggle checked class="accent-ink w-3.5 h-3.5 cursor-pointer disabled:cursor-wait" />
              <span>In use<span class="sr-only"> — SONY ILCE-7CM2</span></span>
            </label>
          </li>
          …
        </ul>
      </div>

      <div class="mt-8">
        <h3 id="gear-active-lens-title" …>Lenses</h3>
        <ul aria-labelledby="gear-active-lens-title" data-gear-list="active-lens" …>…</ul>
      </div>
    </section>

    <section aria-labelledby="gear-inactive-title" data-gear-section="inactive">
      <h2 id="gear-inactive-title" …>Past companions</h2>
      … same two sub-groups, lists "inactive-camera" / "inactive-lens" …
    </section>

  </div>
</main>
```

Notes on the markup:

- `width`/`height` on the `<img>` carry the sample's real dimensions (prevents
  a layout jump before `aspect-square` applies on old browsers; harmless
  otherwise). `object-cover` does the crop.
- `data-gear-order` is the item's index in the DAO list. The client uses it to
  put a moved card back in DAO order rather than at the end (§10.7).
- `data-gear-empty` is the first child of **every** list for admins and is
  rendered with `hidden` when the list has items. For visitors, empty
  sub-groups and empty sections are omitted entirely, so no placeholder is
  ever visible to a visitor.
- The `<label>` is a sibling of the `<a>` (hls correction 5). The visible text
  is "In use"; the `sr-only` span appends the item name so the accessible name
  is unique per card ("In use — SONY ILCE-7CM2").
- `esc()` every interpolated value, including `href`, `alt`, `data-gear-name`,
  and the thumbhash.

### 10.5 Card states

| State | Behaviour |
| --- | --- |
| Rest | Photo over `bg-hairline`/thumbhash; name ink; meta stone. |
| Hover (pointer) | Image scales to 1.03 over 1.1 s (same curve as `.album-img`); meta line goes stone → ink in 150 ms (`transition-colors`). Cursor is the default link pointer. Nothing else moves. |
| Keyboard focus | Global `:focus-visible` outline (1.5 px ink, 3 px offset) around the whole `<a>` block, plus the same image zoom via `.gear-link:focus-visible .gear-img`. |
| Loading | `bg-hairline` → thumbhash blur → `.photo-img.loaded` fade (0.7 s), unchanged from album covers. |
| Admin checkbox, idle | Label stone; hover → ink. Native focus ring replaced by the global outline. |
| Admin checkbox, in flight | `disabled` (browser greys it) + `cursor-wait`. The label stays legible. |
| Admin checkbox, error | Reverted to its previous `checked` state, re-enabled, `alert()` (Step 7). |

### 10.6 Empty states and undated items (R9)

- **No gear at all** (visitor or admin): the hero stays. The sections wrapper
  contains one `<p class="font-mono text-[11px] label text-stone uppercase">No
  gear yet.</p>`. For admins, a second sentence is appended in the same
  element: `Upload a photo with EXIF and it appears here.` Nothing else is
  rendered (no strip hint, no empty lists).
- **Visitor, nothing inactive**: the Past companions section is omitted. The
  page is one section. Same rule in reverse if every item is inactive.
- **Visitor, a sub-group is empty** (for example, no cameras in Past
  companions): that sub-group (`h3` + `ul`) is omitted.
- **Admin**: both sections and all four lists are always present, so a card
  has somewhere to go. An empty list shows its `None yet` placeholder.
- **Undated item** (`firstYear`/`lastYear` null): meta line is the count only,
  `7 photographs`. No dash, no "undated" label. The card is otherwise
  identical. It sorts last within its list (DAO order).
- **No thumbhash**: the frame is plain `bg-hairline` until the image loads
  (existing album-cover behaviour).

### 10.7 Admin view and the card move

- **Where the controls are.** The admin strip (same classes and order as
  `albumsPage`: Admin · hint · Manage photos · Sign out). The strip gets
  `flex-wrap` because the hint is longer than the other strips' items and
  must wrap on phones. Per-card: the checkbox label under the meta line.
- **Hint and live region are one element.** `#gearStatus` starts with the
  hint text (`Tick “In use” to keep an item in the bag`) and carries
  `aria-live="polite"`. After a successful move the client replaces its text
  with `moveMessage(name, active)`, e.g. `FE 24-70mm F2.8 GM II moved to Past
  companions`. One element, no layout shift, no second status line. The
  message stays until the next move.
- **Move behaviour (no animation).** On 204 the client moves the `<li>` to
  `[data-gear-list="<target>"]`, inserting it before the first sibling whose
  `data-gear-order` is greater (pure helper `insertIndex(orders, order)`), so
  the list keeps DAO order without a reload. Then it un-hides/hides the
  `data-gear-empty` placeholders of source and target, re-focuses the checkbox
  (`focus()` scrolls the moved card into view; the page's
  `scroll-behavior: smooth` is already disabled under reduced motion), and
  updates `#gearStatus`.
- **Why no animation.** A fade-out/fade-in would need WAAPI or a class
  choreography, and the card often lands off-screen (the other section is
  below the fold), so the animation would mostly play unseen. The scroll-to-
  focus plus the status line are enough feedback. If one is added later,
  gate it on `matchMedia("(prefers-reduced-motion: reduce)")` (hls correction 11).

### 10.8 Motion and reduced motion

- All motion on the page is CSS `transition` (image zoom, meta colour,
  photo fade-in). The existing `@media (prefers-reduced-motion: reduce)` block
  in `app.css` already zeroes them and forces `.photo-img` opaque.
- The only JS-driven movement is `focus()` after a card move, whose scrolling
  follows `scroll-behavior`, which the same block sets to `auto`.
- No `element.animate()` on this page.

### 10.9 Alt text and accessible names

- **Sample image `alt`**: the photo's `title` when it has one; otherwise
  `Sample photograph`. The item name is the next text node inside the same
  link, so repeating it in the `alt` ("Photograph made with X", then "X")
  would make every card read the name twice. See Open question 11.
- **Card link**: no `aria-label`. Its name is the content: alt + item name +
  meta line, e.g. "Sample photograph, SONY ILCE-7CM2, 42 photographs ·
  2024—2026".
- **Checkbox**: label text "In use" + `sr-only` " — <name>".
- **Lists**: `aria-labelledby` the sub-group `h3`, so a screen reader announces
  "Cameras, list, 2 items".
- **Sections**: `aria-labelledby` the `h2`.
- **Decorative**: the thumbhash `div` has no role or text; nothing else is
  decorative.

### 10.10 Mobile nav current state (Step 5)

`mobileNav(active)`: current link `text-ink` + `aria-current="page"`, every
other link `text-stone`. No hover classes in the mobile menu (it is a touch
surface; the desktop nav keeps `hover:text-ink transition-colors`). This is
the same two-state rule as `desktopNav`, so Albums, Gear, and Contact behave
identically on both navs.

### 10.11 CSS additions (`src/client/css/app.css`)

Add after the `.album-img` rule:

```css
/* Gear cards: same slow zoom as album covers, keyed off the card link.
   Lists both properties so the .photo-img fade-in still runs. */
.gear-img {
  transition:
    opacity 0.7s ease,
    transform 1.1s cubic-bezier(0.2, 0.7, 0.2, 1);
}
.gear-link:hover .gear-img,
.gear-link:focus-visible .gear-img {
  transform: scale(1.03);
}
```

That is the whole addition. Everything else is Tailwind utilities that already
exist in the scan (`accent-ink`, `aspect-square`, `text-balance`,
`group-hover:text-ink`, `col-span-full`, `sr-only` are all generated from
the `@source` scan of `views/gear.ts`). The reduced-motion block needs no
change.

(Aside, not in scope: `.album-img` overrides `.photo-img`'s opacity
transition, so album covers pop in rather than fade. The gear rule above does
not copy that.)

### 10.12 Wireframes

Mobile (375 px, admin view; visitors see no strip and no checkboxes):

```
┌───────────────────────────────────┐
│ Still                          ≡  │  sticky header (unchanged)
│ WISNU PHOTOGRAPHY                 │
├───────────────────────────────────┤
│                                   │
│ CAMERAS & LENSES · 2021—2026      │  mono 10 stone (eyebrow)
│ My Gear                           │  serif 34
│ The cameras and lenses behind     │  serif italic 19 stone
│ the photographs.                  │
│                                   │
│ ADMIN · Tick “In use” to keep an  │  admin strip (wraps)
│ item in the bag · MANAGE PHOTOS   │
│                          SIGN OUT │
│                                   │
│ In the bag                        │  serif 26
│                                   │
│ CAMERAS                           │  mono 10 stone
│ ───────────────────────────────── │  hairline
│ ┌─────────────┐  ┌─────────────┐  │
│ │             │  │             │  │  square thumbs
│ │   photo     │  │   photo     │  │
│ │             │  │             │  │
│ └─────────────┘  └─────────────┘  │
│ SONY ILCE-7CM2   FUJIFILM X100V   │  serif italic 18
│ 42 PHOTOGRAPHS · 12 PHOTOGRAPHS · │  mono 10 stone
│ 2024—2026        2021             │
│ ☑ IN USE         ☑ IN USE         │  admin only
│                                   │
│ LENSES                            │
│ ───────────────────────────────── │
│ ┌─────────────┐  ┌─────────────┐  │
│ │   photo     │  │   photo     │  │
│ └─────────────┘  └─────────────┘  │
│ FE 24-70mm       17mm F4 DG DN |  │
│ F2.8 GM II       Contemporary 023 │
│ 18 PHOTOGRAPHS · 7 PHOTOGRAPHS    │  ← undated: count only
│ 2025—2026                         │
│ ☑ IN USE         ☑ IN USE         │
│ ┌─────────────┐                   │
│ │   photo     │                   │
│ └─────────────┘                   │
│ …                                 │
│                                   │
│                                   │  gap-14
│ Past companions                   │  serif 26 (visitors: omitted if empty)
│                                   │
│ CAMERAS                           │
│ ───────────────────────────────── │
│ NONE YET                          │  admin-only placeholder
│                                   │
│ LENSES                            │
│ ───────────────────────────────── │
│ ┌─────────────┐                   │
│ │   photo     │                   │
│ └─────────────┘                   │
│ FE 35mm F1.8                      │
│ 3 PHOTOGRAPHS · 2022              │
│ ☐ IN USE                          │
│                                   │
├───────────────────────────────────┤
│ © 2026 WISNU PRAMADHITYA RAMADHAN │  footer (unchanged)
└───────────────────────────────────┘
```

Desktop (≥ 1024 px, container capped at 1400 px, admin view):

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Still                                                       ALBUMS   GEAR   CONTACT│  Gear = text-ink, aria-current
│ WISNU PHOTOGRAPHY                                                                  │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│ CAMERAS & LENSES · 2021—2026                                                       │
│ My Gear                                                                            │  serif 46
│ The cameras and lenses behind the photographs.                                     │  serif italic 22, max-w-xl
│                                                                                    │
│ ADMIN · Tick “In use” to keep an item in the bag · MANAGE PHOTOS           SIGN OUT│
│                                                                                    │
│ In the bag                                                                         │  serif 30
│                                                                                    │
│ CAMERAS                                                                            │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ ┌────────────────┐  ┌────────────────┐                                             │
│ │                │  │                │                                             │
│ │     photo      │  │     photo      │               (empty cells)                 │
│ │                │  │                │                                             │
│ └────────────────┘  └────────────────┘                                             │
│ SONY ILCE-7CM2      FUJIFILM X100V                                                 │
│ 42 PHOTOGRAPHS ·    12 PHOTOGRAPHS ·                                               │
│ 2024—2026           2021                                                           │
│ ☑ IN USE            ☑ IN USE                                                       │
│                                                                                    │
│ LENSES                                                                             │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐     │
│ │     photo      │  │     photo      │  │     photo      │  │     photo      │     │
│ └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘     │
│ FE 24-70mm F2.8     17mm F4 DG DN |     FE 35mm F1.8        FE 85mm F1.8           │
│ GM II               Contemporary 023                                               │
│ 18 PHOTOGRAPHS ·    7 PHOTOGRAPHS       9 PHOTOGRAPHS ·     4 PHOTOGRAPHS ·        │
│ 2025—2026                               2023—2026           2024                   │
│ ☑ IN USE            ☑ IN USE            ☑ IN USE            ☑ IN USE               │
│                                                                                    │
│                                                                                    │  gap-20
│ Past companions                                                                    │
│                                                                                    │
│ CAMERAS                                                                            │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ NONE YET                                                                           │
│                                                                                    │
│ LENSES                                                                             │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ ┌────────────────┐                                                                 │
│ │     photo      │                                                                 │
│ └────────────────┘                                                                 │
│ FE 50mm F1.8                                                                       │
│ 3 PHOTOGRAPHS · 2022                                                               │
│ ☐ IN USE                                                                           │
│                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────┤
│ © 2026 WISNU PRAMADHITYA RAMADHAN                                                  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

Hover on a card (pointer): the photo zooms 3 % inside its square; the mono
line under it turns ink. Keyboard focus: a 1.5 px ink outline, 3 px outside
the card's photo + text block, plus the same zoom.

## 11. Open questions (with chosen defaults)

1. **Merge/release order with gear-search (R11).** If `/gear` ships alone,
   the card links return 404. *Default:* merge this project first and
   gear-search right after, before the next release tag. If the release must go
   out in between, temporarily render cards without the `<a>` (one-line switch
   in `gearPage`).
2. **Item order within a section.** The PRD does not say. *Default:* most
   recently used first (`last_taken DESC`, undated last), then photo count, then
   name.
3. **Section and toggle wording.** The PRD offers "In the bag" and
   "Resting" / "Past companions". *Default:* "In the bag" / "Past companions",
   and the checkbox label "In use". The owner finalises the copy in `views/gear.ts`.
4. **Sample photo for an inactive item.** It is the most recent photo either
   way. *Default:* the same rule for both sections (R6).
5. **Name-length cap.** *Default:* 200 characters, shared with gear-search's
   query cap, so any togglable name is also searchable.
6. **Exact-string identity.** `SONY ILCE-7CM2` is shown raw (no display names,
   per non-goals). Two aliases of one physical lens show as two items. *Default:*
   accepted for v1, as the PRD says.
7. **Admin strip on `/gear`.** The album pages show an admin strip (Sign out,
   Manage photos). *Default (changed in the design pass):* reuse the strip,
   with the hint in the slot where the showcase strip has "Long-press photo
   to manage". Reasons: every admin-visible page then has Sign out and
   Manage photos in the same place, and the hint line needs a home anyway.
   The strip is admin-only, so the visitor page stays as quiet as before.
8. **Undated photos.** These items have counts but no years. *Default:* show
   the count only and omit the year range (and the ` · ` separator).
9. **No-JS admin toggle.** *Default:* not supported. This is consistent with
   the existing admin UI.
10. **Square sample crop.** Samples are portrait and landscape; the card
    frame is `aspect-square` with `object-cover`, so tall and wide samples
    get cropped. Alternatives: 4:5 (favours portraits, which most of the
    gallery is) or the sample's native ratio (uneven grid). *Default:*
    square, because the grid stays even and the photo is a swatch here, not
    the work. One-token change (`aspect-square` → `aspect-[4/5]`).
11. **Alt text without a title.** The plan earlier said
    `Photograph made with <name>`. *Default (changed):* `Sample photograph`.
    The item name is the next text node in the same link, so the longer form
    makes every card read the name twice. If the owner prefers the explicit
    form for standalone meaning, it is a one-line change in `gearCard()`.
12. **Eyebrow and intro copy.** *Default:* eyebrow
    `Cameras & Lenses · <first>—<last>`; intro "The cameras and lenses behind
    the photographs." Owner's
    call; both live in `gearPage()`.
13. **Grid density.** *Default:* 2 / 3 / 4 columns at base / `sm` / `lg`.
    A fifth column at `xl` would make ~250 px cards at 1400 px; not added
    because names like `17mm F4 DG DN | Contemporary 023` already wrap to
    two lines at 310 px.
14. **Re-insert in DAO order after a move.** *Default:* yes, via
    `data-gear-order` + `insertIndex` (a few lines). Alternative: append to
    the end of the target list and let the next reload sort it. Appending
    was rejected because the admin sees a different order after reload.
