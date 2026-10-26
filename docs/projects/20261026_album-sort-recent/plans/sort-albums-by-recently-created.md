# Plan — Sort albums by recently created

Project: `docs/projects/20261026_album-sort-recent/` · Source of truth: `prd.md` ·
Starting point: `hls.md` · Written 2026-10-26.

## Summary

Change the album order on `/` and `GET /api/albums` from "oldest first by
`position`" to "Discover first, then newest first". This is a single
`ORDER BY` change in `listAlbums` in `src/server/services/photos.ts`, plus DAO
tests and two wiki edits. No schema change, no migration, no client change.
`position` and `nextAlbumPosition` stay as they are, for the future
custom-sort project (PRD R4, Future).

New order:

```sql
ORDER BY (a.slug = ?) DESC, a.created_at DESC, a.rowid DESC
-- bound to DEFAULT_ALBUM_SLUG ("discover")
```

## hls.md verification and corrections

Verified against the code at commit `bea1182`.

Correct in hls.md:

- `listAlbums` is in `src/server/services/photos.ts` (line 204, as the wiki says)
  and currently orders `a.position ASC, a.created_at ASC` (line 208).
- `albums.created_at` is `TEXT NOT NULL DEFAULT (datetime('now'))`
  (`src/server/db/schema.sql:13`), so it has 1-second resolution and the format
  `YYYY-MM-DD HH:MM:SS`.
- `albums` has `id TEXT PRIMARY KEY` and is not `WITHOUT ROWID`, so `rowid`
  exists and grows with each insert.
- `DEFAULT_ALBUM_SLUG = "discover"` is module-private (`photos.ts:14`).
- The only `listAlbums` consumers are `src/server/routes/pages.ts:19` (`/`) and
  `src/server/routes/api.ts:12` (`GET /api/albums`). No other code depends on
  album order.
- No existing test asserts album order (`photos.test.ts`, `auth.test.ts`,
  `auth.upload.test.ts` do not call `listAlbums` or `GET /api/albums`).

Corrections and additions:

1. **No export is needed for the query.** `listAlbums` is in the same module as
   `DEFAULT_ALBUM_SLUG`, so the query can use the constant directly. Bind it
   as a SQL parameter (`.all(DEFAULT_ALBUM_SLUG)`) instead of interpolating it
   into the SQL string. An export is only useful if tests want to reference it.
   Default: keep it private. Tests use the literal `"discover"`, which also
   tests the public contract (the slug that ingest auto-creates).
2. **Discover can be created in two ways.** `ensureAlbum` creates it on the
   first ingest without an album (`photos.ts:470-475`). `createAlbum` with the
   name "Discover" also gives slug `discover` if it is free. Both are pinned,
   because the pin keys on the slug. hls.md mentions only renaming.
3. **Seed data order flips.** `src/server/db/seed.ts` inserts six albums
   (`cities` … `streets`) in one run, so they all get the same `created_at`
   second. The `rowid DESC` tiebreak shows them in reverse seed order
   (`streets` first). This is correct per R2, but it changes how the dev seed
   looks. The seed has no Discover album. hls.md does not mention this.
4. **`rowid` and `VACUUM`.** For tables without an `INTEGER PRIMARY KEY`, SQLite
   says `VACUUM` may change rowids. The code never runs `VACUUM` (grep shows no
   matches). In practice `VACUUM` keeps the relative order, and the tiebreak
   only matters for albums created in the same second. Low risk; record it in
   the code comment.
5. **Timestamp format in tests.** Tests that set `created_at` directly must use
   the `datetime('now')` format (`YYYY-MM-DD HH:MM:SS`), not
   `toISOString()`. `'T'` sorts after `' '`, so mixed formats sort wrongly. The
   existing photo test helpers use `toISOString()` for photos. Do not copy that
   for albums.
6. **Docs.** `album-list-page.md` does not mention order today. Add one line so
   the page is complete. `docs/wiki/adding-photos.md` and
   `docs/wiki/ios-shortcut-scriptable.md` describe `GET /api/albums` but say
   nothing about order, so they need no change.
7. **Index.** No index is needed. The albums table is small, and the query
   already does a full scan with correlated sub-queries per row.

## Files to change

| File | Change |
| --- | --- |
| `src/server/services/photos.ts` | `listAlbums(_ctx)`: new `ORDER BY`, bind `DEFAULT_ALBUM_SLUG`, prepare type `<[string], AlbumRow>`, short doc comment |
| `src/server/services/photos.test.ts` | New `describe("listAlbums ordering")` block; import `ensureAlbum`, `listAlbums` |
| `src/server/routes/api.test.ts` (new) | Small route test for `GET /api/albums` shape and order |
| `docs/wiki/codebase/database.md` | Update the `listAlbums` row ordering note |
| `docs/wiki/codebase/album-list-page.md` | Add an "Order" line |

Not changed: `schema.sql`, `migrate.ts`, `seed.ts`, `nextAlbumPosition`,
`createAlbum`, `ensureAlbum`, `routes/pages.ts`, `routes/api.ts`,
`views/albums.ts`, all client code.

## Implementation steps

1. **`listAlbums`** in `src/server/services/photos.ts` (currently lines
   204-211). Replace the body with:

   ```ts
   /**
    * Albums for `/` and `GET /api/albums`: the Discover album first, then newest
    * first. `created_at` has 1 s resolution, so `rowid DESC` puts the later
    * insert first on a tie. `position` is kept for a future custom sort.
    */
   export function listAlbums(_ctx: Ctx): AlbumWithCover[] {
     const rows = getDb()
       .prepare<[string], AlbumRow>(
         `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN}
          ORDER BY (a.slug = ?) DESC, a.created_at DESC, a.rowid DESC`,
       )
       .all(DEFAULT_ALBUM_SLUG);
     return rows.map(toAlbumWithCover);
   }
   ```

   Notes:
   - `rowid` is not in `ALBUM_COLUMNS`, so the `AlbumRow` type does not change.
     `ORDER BY a.rowid` works without selecting it.
   - `COVER_JOIN` is a `LEFT JOIN` to at most one cover photo per album, so it
     does not add rows and does not change the order.
   - R3 (no Discover): `(a.slug = ?)` is 0 for every row, so the order is
     newest first.
2. Leave `position`, `nextAlbumPosition`, and the `INSERT` statements as they
   are (R4).
3. Add the tests (next section).
4. Update the wiki (see "Docs and wiki updates").
5. Run `pnpm typecheck`, `pnpm lint`, `pnpm fmt`, `pnpm test`.
6. Manual check: `pnpm db:seed && pnpm dev`, open `/`. Seed albums show in
   reverse seed order. Create an album from the admin strip. It shows first.
   Ingest a photo with no album (creates Discover). Discover shows first.
   `curl localhost:<port>/api/albums` shows the same order.

## Schema / migration

None. `created_at` and `rowid` already exist. `position` stays (R4).

## Tests

### DAO — `src/server/services/photos.test.ts`

Use the existing harness: the mocks at the top of the file,
`closeDb(); migrate();` in `beforeEach`, `closeDb()` in `afterEach`,
`consoleCtx`. Add `ensureAlbum` and `listAlbums` to the import from
`./photos.js`.

Helper inside the block (keeps the `datetime('now')` format):

```ts
function setCreatedAt(id: string, ts: string): void {
  getDb().prepare(`UPDATE albums SET created_at = ? WHERE id = ?`).run(ts, id);
}
const slugs = () => listAlbums(consoleCtx).map((a) => a.slug);
```

Cases:

1. **Discover pinned, then newest first (PRD acceptance 1).** Create Discover
   with `ensureAlbum(consoleCtx, "discover", "Discover")` and set it to the
   oldest time (`2020-01-01 00:00:00`). Create A (`2024-01-01 00:00:00`) and B
   (`2025-01-01 00:00:00`). Expect `["discover", "b", "a"]`.
2. **Same-second tiebreak (R2, acceptance 2).** Create A then B with
   `createAlbum`, then set both to the same `created_at`. Expect
   `["b", "a"]`. Setting the time removes flakiness when the two inserts cross
   a second boundary.
3. **No Discover (R3).** Three albums with different times. Expect newest
   first.
4. **`position` is ignored for order but preserved (R4).** Create A and B.
   Check that `position` values are still `0` and `1` (from
   `nextAlbumPosition`) and that the order is still by `created_at`.
5. **Discover made with `createAlbum`.** `createAlbum(consoleCtx, { name:
   "Discover" })` gives slug `discover` and is pinned. This documents
   correction 2.

### Route — `src/server/routes/api.test.ts` (new, small)

Covers PRD acceptance 3 (shape unchanged). Follow the route harness in
`auth.test.ts`: `vi.mock("../config.js")` with `paths.db = ":memory:"` and tmp
dirs (include `ingestConcurrency` in case it is needed through imports),
`closeDb(); migrate();`, a bare `Fastify()` with `apiRoutes` under
`{ prefix: "/api" }`. Create Discover, A, B as above. Assert:

- status 200;
- body is `{ albums: [{ id, slug, name }, …] }` with exactly these three keys
  per item;
- slugs are `["discover", "b", "a"]`.

`routes/api.ts` imports `services/photos.ts`, which imports `sharp` and the
derivative modules. If importing them in the test is a problem, reuse the
mocks from `photos.test.ts:8-31`.

Update `docs/wiki/codebase/testing.md`: add `api.test.ts` to the test table,
and note that `photos.test.ts` now covers `listAlbums` ordering.

## Accessibility

No markup change. The grid stays in DOM order, so keyboard and screen-reader
order follow the new visual order. No new motion or focus behavior.

## Docs and wiki updates

- `docs/wiki/codebase/database.md`, `listAlbums` row: change
  "(ordered `position ASC, created_at ASC`)" to
  "(ordered Discover first — `slug = DEFAULT_ALBUM_SLUG` — then
  `created_at DESC, rowid DESC`; `position` is stored but unused for order)".
  Line numbers in the table are still correct; check them again after the
  edit, because the new doc comment moves later functions down by about five
  lines.
- `docs/wiki/codebase/album-list-page.md`: add
  "Order: Discover first, then newest album first — from `listAlbums`, shared
  with `GET /api/albums`."
- `docs/wiki/codebase/testing.md`: as above.
- No change to `adding-photos.md` or `ios-shortcut-scriptable.md` (they do not
  state an order).

## Open questions (with chosen defaults)

1. **Export `DEFAULT_ALBUM_SLUG`?** hls.md says to export it. It is not needed
   for the query. **Default:** keep it private and bind it as a parameter.
   Tests use the literal `"discover"`.
2. **Dev seed order.** All seed albums share one `created_at` second, so they
   show in reverse seed order. **Default:** accept it; do not change
   `seed.ts`. The PRD does not cover seed data.
3. **Pin follows the slug, not an id.** If the owner renames the Discover slug,
   the pin is lost. If someone deletes Discover and later creates an album with
   slug `discover`, that album is pinned. **Default:** accept (hls.md agrees).
   There is no slug-edit feature today.
4. **Should `position` still be written on insert?** It is now unused for
   order. **Default:** yes, keep writing it (R4, Future: the custom-sort
   project can use it without a migration).
5. **Route test for `GET /api/albums`.** `api.ts` does not change, so the DAO
   test alone covers the order. **Default:** add the small route test, because
   PRD acceptance 3 names the endpoint shape and there is no API test today.
6. **iOS Shortcut picker order changes.** The PRD accepts this. **Default:** no
   action. Discover first is a useful default for the picker.
