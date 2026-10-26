# Set Album Cover

Status: proposed · Created 2026-10-26 · Source: [prd.md](../prd.md), [hls.md](../hls.md)

## Summary

Let the admin choose which photo represents an album on `/`. The data model
already supports this: `albums.cover_photo_id` exists, and `COVER_JOIN` in
`src/server/services/photos.ts` prefers it over the automatic fallback (most
recently taken photo). Nothing writes the column except the seed script and the
cover promotion inside `deletePhoto`.

This plan adds:

1. Two DAO functions: `setAlbumCover` and `resetAlbumCover`. The album is
   always derived from the photo, so R4 holds by construction.
2. Two session routes: `POST` and `DELETE /admin/photos/:photoId/cover`.
3. A cover state per row in `listAllPhotos` (`"pinned" | "auto" | null`).
4. Entry point 1: a "Set as album cover" item in the long-press menu on
   `/albums/:slug`, with a non-blocking status message.
5. Entry point 2: a cover badge and a "Set as cover" / "Reset to auto" button
   per row on `/admin/photos`.

No schema change. No new dependency.

---

## hls.md corrections

| # | hls.md says | Real code / correction |
| --- | --- | --- |
| C1 | Route returns `204`. | The admin portal must update the badge on **every** row of the album. After a reset, the client cannot compute the automatic cover: the model has no `taken_at`. **Return `200` with JSON** `{ albumId, coverPhotoId, pinned }` for both POST and DELETE. The PRD only requires 401 and 404, so this does not conflict. |
| C2 | `setAlbumCover(ctx, photoId, { reset? })` | Use two functions, `setAlbumCover` and `resetAlbumCover`. Both resolve the album from the photo. A boolean flag that changes the SQL is harder to read and test. |
| C3 | "`listAllPhotos` row shape changes → update CSV export/import" | Not needed. `GET /admin/photos/export` (`routes/auth.ts`) builds CSV rows from explicit fields (`id, path, title, comment`). The import calls `updatePhoto` only. Adding a field to `PhotoTableRow` does not change the CSV. Only the test fixtures need the new field: `row()` in `views/admin-photos.test.ts`, and `RowModel` in `client/ts/admin-photos.test.ts`. |
| C4 | "Bump the hard-coded `menuH` (52)" | `openMenu()` in `src/client/ts/admin.ts` hard-codes `menuW = 188` and `menuH = 52`. Bumping the number is fragile. **Measure the menu instead.** Remove `hidden`, read `menu.offsetWidth` / `menu.offsetHeight`, then clamp. Two items at `py-3` + `py-1` + border is about 92 px, so 52 would clip on short viewports (R7). |
| C5 | "`isCover` on `PhotoTableRow`" | One boolean cannot show both "current cover" (R5) and "pinned or automatic" (R6). Use `coverState: "pinned" \| "auto" \| null`. Note: `src/server/db/seed.ts` pins `cover_photo_id` for every seeded album. Seeded albums therefore show as **pinned**, not auto. This is expected. |
| C6 | The auto-cover subquery lives in `COVER_JOIN`. | `listAllPhotos` needs the **same** auto-cover expression to mark the `"auto"` row. Extract it into one shared SQL fragment so the marker and the `/` card cannot disagree. See Q3 for the tie-break. |
| C7 | "Wire a click handler using the same `fetch` convention as delete." | Correct, with one gotcha. Do **not** send `Content-Type: application/json` with an empty body on POST. Fastify 5 rejects that with 400 (`FST_ERR_CTP_EMPTY_JSON_BODY`). Send no body and no content type, as the DELETE call does. |
| C8 | Wiki line numbers. | Drifted. Real locations as of today: the `routes/auth.ts` DELETE is at `:106`, `GET /admin/photos` at `:178`, PATCH at `:187`, export at `:215`, and import at `:245`. `client/ts/admin.ts`: the delete handler is at `:108-138` and `openMenu` at `:27-37`. `listAllPhotos` is at `photos.ts:249` and `deletePhoto` at `:554`, both still correct. |
| C9 | Missing from hls.md | The album page has no feedback surface. Add one SSR `role="status"` element to the admin strip, so success needs no `alert()` (PRD decision). |

---

## Files to change

| File | Change |
| --- | --- |
| `src/server/services/photos.ts` | Add the `autoCoverSql()` fragment and use it in `COVER_JOIN`. Add `coverState` to `PhotoTableRow` and `PhotoTableRowSql`, and to the `listAllPhotos` SELECT and mapping. Add `AlbumCoverResult`, `setAlbumCover` and `resetAlbumCover`, plus a private `albumIdOfPhoto` helper. |
| `src/server/routes/auth.ts` | Add `POST /photos/:photoId/cover` and `DELETE /photos/:photoId/cover` (session-guarded). Import the new DAO functions. |
| `src/server/views/admin-photos.ts` | In `tableRow()`, render the cover badge and button in the Image cell. Add the sr-only `#photos-cover-status` live region. |
| `src/client/ts/admin-photos.ts` | Add `coverState` to `RowModel`/`toRowModel`. Add pure helpers `applyAlbumCover` and `coverAction`. In `initAdminPhotos()`, wire the cover buttons, add `reflectCover`, and sync `coverState` in `refreshFromServer`. |
| `src/server/views/showcase.ts` | In `showcasePage()`, add a `role="status"` span (`data-admin-status`) to the admin strip. |
| `src/client/ts/admin.ts` | In `buildMenu()`, add the "Set as album cover" item. Make `openMenu()` measure its own size. Add a click handler and a `flashStatus()` helper. |
| Tests | `services/photos.test.ts`, `routes/auth.test.ts`, `views/admin-photos.test.ts`, `client/ts/admin-photos.test.ts` |
| Wiki | `database.md`, `admin-auth.md`, `admin-photos-page.md`, `album-detail-page.md`, `testing.md`, `README.md` (update stamp) |

Do not change `src/server/db/schema.sql`, `routes/admin.ts` (HMAC scope), `views/albums.ts` or `routes/pages.ts`. The `/` card already reads `album.cover` through `COVER_JOIN`.

---

## Step-by-step implementation

### 1. DAO — `src/server/services/photos.ts`

1. **Shared auto-cover fragment.** Replace the inline subquery in `COVER_JOIN` with a function:

   ```ts
   /** Id of an album's automatic cover: most recently taken photo. */
   const autoCoverSql = (albumIdExpr: string) =>
     `(SELECT ac.id FROM photos ac WHERE ac.album_id = ${albumIdExpr}
       ORDER BY ac.taken_at DESC, ac.created_at DESC, ac.id ASC LIMIT 1)`;

   const COVER_JOIN = `
     LEFT JOIN photos cp ON cp.id = COALESCE(a.cover_photo_id, ${autoCoverSql("a.id")})
   `;
   ```

   The tie-break is `created_at DESC, id ASC`. Note: this does **not** match
   `listPhotos`, which orders `taken_at DESC, created_at DESC` without `id`.
   See Q3.

2. **Row types.** Add `coverState: "pinned" | "auto" | null` to `PhotoTableRow`. Add `cover_state: "pinned" | "auto" | null` to `PhotoTableRowSql`.

3. **`listAllPhotos`.** Add this to the SELECT:

   ```sql
   CASE
     WHEN a.cover_photo_id = p.id THEN 'pinned'
     WHEN a.cover_photo_id IS NULL AND p.id = ${autoCoverSql("a.id")} THEN 'auto'
     ELSE NULL
   END AS cover_state
   ```

   The fragment uses its own alias, `ac`, so it does not shadow the outer `p` in `listAllPhotos`. Map the column to `coverState: row.cover_state`. The correlated subquery runs once per row and uses `idx_photos_album_taken`. This is fine at gallery scale.

4. **Helper and writers.** Place them after `updatePhoto`, in a new "Album cover" section:

   ```ts
   export interface AlbumCoverResult {
     albumId: string;
     /** Effective cover shown on `/` (pinned or automatic); null for an empty album. */
     coverPhotoId: string | null;
     /** True when albums.cover_photo_id is set. */
     pinned: boolean;
   }

   function albumIdOfPhoto(photoId: string): string // throws 404-tagged Error (same shape as updatePhoto)

   export function setAlbumCover(ctx: Ctx, photoId: string): AlbumCoverResult
   //   UPDATE albums SET cover_photo_id = ? WHERE id = ?   (photoId, albumIdOfPhoto(photoId))

   export function resetAlbumCover(ctx: Ctx, photoId: string): AlbumCoverResult
   //   UPDATE albums SET cover_photo_id = NULL WHERE id = ?  (unconditional, idempotent)
   ```

   Both return a result built from `getAlbum(ctx, albumId)`: `{ albumId, coverPhotoId: album.cover?.id ?? null, pinned: album.coverPhotoId !== null }`. Do not invalidate `yearRangeCache`, because years do not change. Do not change `deletePhoto` (R8).

### 2. Routes — `src/server/routes/auth.ts`

Add the routes next to the existing `app.delete("/photos/:photoId")`:

```ts
app.post<{ Params: { photoId: string } }>("/photos/:photoId/cover", async (request, reply) => {
  if (!getAdminSession(request)) return reply.code(401).send({ error: "Unauthorized" });
  try {
    return reply.code(200).send(setAlbumCover(ctxFromRequest(request), request.params.photoId));
  } catch (err: unknown) {
    if (errStatus(err) === 404) return reply.code(404).send({ error: "Photo not found" });
    throw err;
  }
});
// app.delete(... "/photos/:photoId/cover" ...) — identical, calls resetAlbumCover
```

- Collision check: the HMAC scope owns only `POST /admin/albums` and `POST /admin/photos` (exact paths). `/photos/:photoId/cover` has three segments, so it does not collide with `/photos/upload`, `/photos/import` or `/photos/:photoId`.
- No body schema. The client sends no body (see C7).
- Admins already bypass the rate limit (`plugins/rate-limit.ts`).

### 3. Album page — the long-press menu

**`src/server/views/showcase.ts` (`showcasePage`, admin strip).** After the "Long-press photo to manage" span, add:

```html
<span data-admin-status role="status" aria-live="polite"
      class="font-mono text-[9px] label text-ink uppercase tracking-widest"></span>
```

**`src/client/ts/admin.ts`:**

1. `buildMenu()`: put the cover item **before** Delete, so the destructive action stays last. Separate the two items with a hairline:

   ```html
   <button data-menu-cover role="menuitem"
     class="w-full text-left px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-ink hover:bg-stone/5 focus-visible:outline-none focus-visible:bg-stone/10 transition-colors">
     Set as album cover
   </button>
   <div class="border-t border-hairline my-1" role="separator"></div>
   <button data-menu-delete …>Delete photo</button>
   ```

2. `openMenu(photoId, x, y)`: remove the `menuW`/`menuH` constants. Remove `hidden` first, read `menu.offsetWidth` / `menu.offsetHeight`, then compute `left`/`top` with the same `Math.min(..., window.innerWidth - w - 8)` clamp. Also clamp to at least 8 (`Math.max(8, …)`) so a very narrow viewport never yields a negative offset (R7).

3. Add a click handler for `[data-menu-cover]`. It mirrors the delete handler but has no `confirm()`:

   ```ts
   const res = await fetch(`/admin/photos/${encodeURIComponent(photoId)}/cover`, {
     method: "POST", credentials: "include",
   });
   if (res.ok) flashStatus("Album cover set");
   else alert(`Set cover failed (${res.status})`);
   // catch → alert("Set cover failed — check your connection.");
   ```

4. `flashStatus(text)`: write the text to `[data-admin-status]`, then clear it after 3 s. It uses no animation, so `prefers-reduced-motion` needs no handling. If the element is missing, do nothing. Do not use `alert()` on success (PRD decision).

### 4. Admin portal — `/admin/photos`

**View: `src/server/views/admin-photos.ts`, `tableRow()`, Image cell.** Put the controls under the thumbnail. This keeps the seven-column header and the existing column-order test unchanged.

```html
<div class="mt-2 flex flex-col gap-1">
  <span data-cover-badge class="${row.coverState ? "" : "hidden "}font-mono text-[9px] label uppercase tracking-widest text-ink">
    ${row.coverState === "auto" ? "Cover · auto" : "Cover"}
  </span>
  <button type="button" data-cover-action
          data-cover-method="${row.coverState === "pinned" ? "DELETE" : "POST"}"
          aria-label="${pinned ? `Reset cover of ${esc(albumName)} to automatic` : `Set photo ${esc(id)} as cover of ${esc(albumName)}`}"
          class="self-start font-mono text-[9px] label uppercase tracking-widest text-stone hover:text-ink underline decoration-hairline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-30 transition-colors">
    ${pinned ? "Reset to auto" : "Set as cover"}
  </button>
</div>
```

The badge is text, not only a colour or icon, so R5 holds without relying on colour. Add an sr-only live region after `#photos-import-summary`:
`<p id="photos-cover-status" class="sr-only" role="status" aria-live="polite"></p>`.

**Client: `src/client/ts/admin-photos.ts`.**

Pure helpers (unit-tested):

```ts
export type CoverState = "pinned" | "auto" | null;
// RowModel gains: coverState: CoverState;  toRowModel copies row.coverState

/** Pure: label + HTTP method for a row's cover button. */
export function coverAction(row: RowModel): { label: string; method: "POST" | "DELETE" }

/** Pure: apply a server AlbumCoverResult to every row of that album. */
export function applyAlbumCover(
  rows: RowModel[], albumSlug: string,
  result: { coverPhotoId: string | null; pinned: boolean },
): RowModel[]
// each row with r.albumSlug === albumSlug:
//   r.coverState = r.id === result.coverPhotoId ? (result.pinned ? "pinned" : "auto") : null
```

DOM wiring in `initAdminPhotos()`:

- `reflectCover(m)`: toggle and set the text of `[data-cover-badge]`. Set the button text, `aria-label` and `data-cover-method` from `coverAction(m)`. Update the existing element rather than re-rendering it, so keyboard focus stays on the button after a toggle.
- For each model, bind a click on `[data-cover-action]`. Disable the button, then call `fetch(`/admin/photos/${id}/cover`, { method, credentials: "include" })`. On `res.ok`, parse `AlbumCoverResult`, run `applyAlbumCover(models, m.albumSlug, result)`, call `reflectCover` on every model of that album (including hidden pages), and announce "Cover set for {album}" or "Cover of {album} reset to automatic" in `#photos-cover-status`. On failure, show the error in the row's existing `[data-error]` span. Do not change `m.state`, so autosave is not affected. Re-enable the button in `finally`.
- `refreshFromServer()`: also copy `row.coverState` into the model and call `reflectCover`.
- Do not change the autosave, filter or pagination logic.

---

## Schema / migration

None. `albums.cover_photo_id` already exists (`src/server/db/schema.sql`). It is not a foreign key. `deletePhoto` already clears or promotes it, and the album cascade removes everything else. The project has no versioned migrations (`migrate()` is `CREATE … IF NOT EXISTS`), and none are needed.

---

## Tests

Follow the existing harnesses. See `docs/wiki/codebase/testing.md`.

**`src/server/services/photos.test.ts`.** Add `describe("setAlbumCover / resetAlbumCover")`. Reuse the `closeDb(); migrate(); createAlbum(...)` setup and the local `insertPhoto` helper with explicit `taken_at`/`created_at`. Cases:

- `setAlbumCover` writes `cover_photo_id` and returns `{ albumId, coverPhotoId: id, pinned: true }`.
- It overwrites an earlier pin.
- `getAlbum(...).cover.id` equals the pinned photo, even when another photo has a later `taken_at`. This proves the `/` read path picks it up.
- An unknown photo throws `{ statusCode: 404 }` and leaves the album unchanged.
- R4: two albums. Setting album B's photo changes only album B. Album A's `cover_photo_id` stays the same.
- `resetAlbumCover` sets the column to NULL. The result is `pinned: false`, and `coverPhotoId` is the latest-taken photo.
- `resetAlbumCover` is idempotent when the album is already automatic.
- R8 interplay: pin p1, then `deletePhoto(p1)`. The cover is promoted to the most recently uploaded remaining photo (existing behaviour, unchanged).
- `listAllPhotos` `coverState`: pinned → `"pinned"` on that row only. No pin → `"auto"` on the latest-taken row and `null` elsewhere. Empty album → no rows. Two albums are marked independently.
- Tie-break: two photos with equal `taken_at`. `listAllPhotos` marks the same id that `getAlbum().cover.id` returns.
- Update the existing `listAllPhotos returns one row per photo…` expectation to include `coverState`.

**`src/server/routes/auth.test.ts`.** Add `describe("POST|DELETE /admin/photos/:id/cover")`. Use the existing `buildTestApp`, `signIn` and `insertPhoto` helpers.

- No cookie: POST → 401, DELETE → 401. Add these to the existing "auth gate" block.
- POST with a session → 200 with `{ albumId: "alb", coverPhotoId: "p1", pinned: true }`. Check that the DB column equals `p1`.
- POST for an unknown id → 404 `{ error: "Photo not found" }`.
- DELETE with a session → 200 with `pinned: false`. The DB column is NULL.
- POST with no body and no content type → 200. This guards C7.
- After a POST, `GET /admin/photos` HTML contains the `Reset to auto` button for that row (smoke test).

**`src/server/views/admin-photos.test.ts`.** Add `coverState: null` to the `row()` fixture. New cases:

- Pinned row: shows the "Cover" badge and a `data-cover-method="DELETE"` "Reset to auto" button.
- Auto row: shows "Cover · auto" and a "Set as cover" button.
- Null row: the badge has `hidden` and the button says "Set as cover".
- The `aria-label` escapes the album name (XSS case, like the existing escape test).
- The JSON island round-trips `coverState`.

**`src/client/ts/admin-photos.test.ts`.** Add `coverState: null` to the `row()` fixture and to the `toRowModel` expectation. New cases:

- `coverAction` maps pinned → `{ "Reset to auto", "DELETE" }` and other states → `{ "Set as cover", "POST" }`.
- `applyAlbumCover` sets the target to pinned and clears the other rows of that album. It leaves other albums untouched. With `pinned: false`, it marks `"auto"`. With `coverPhotoId: null`, it clears all rows of the album.
- `filterRows` and `dirtyRows` behaviour is unchanged (existing tests still pass).

`client/ts/admin.ts` has no unit tests (a known gap, because vitest runs in node). Cover the menu manually. See the checks below.

**Manual checks** (`pnpm dev`, signed in):

1. On `/albums/x`, right-click a photo. The menu shows two items and is not clipped near the bottom-right corner. Repeat at a 320×568 viewport with a long-press.
2. Choose "Set as album cover". "Album cover set" appears in the admin strip and clears after 3 s, with no alert. Reload `/` and the card shows the photo.
3. Delete from the menu still works.
4. On `/admin/photos`, reach the button with Tab only. The focus ring is visible. Press Enter, and the badge moves across rows of the same album, including rows on other pages after paging. Choose "Reset to auto", and the badge returns to "Cover · auto" on the latest-taken photo.
5. Sign out in another tab, then click "Set as cover". The row shows the error message (401).

Run `pnpm typecheck && pnpm lint && pnpm test`.

---

## Accessibility

- The admin portal is the keyboard path (PRD acceptance). It uses real `<button>`s with descriptive `aria-label`s, `focus-visible:ring-2 ring-ink`, and text badges, so the cover state does not depend on colour. Results are announced through `role="status"`. Focus stays on the toggled button.
- Long-press menu: the new item is a `role="menuitem"` button with a `focus-visible` style. The menu is pointer-only today: it opens on long-press or right-click and has no keyboard trigger. Adding a keyboard trigger is out of scope. See Q5.
- The album-page status message is in a polite live region and is not animated, so `prefers-reduced-motion` is not affected.
- Meaningful `alt` is unchanged. The cover card already uses `"{album} — featured photograph"`.

---

## Docs / wiki updates

- `docs/wiki/codebase/database.md`: add `setAlbumCover` / `resetAlbumCover` and `AlbumCoverResult` to the DAO table. Note `autoCoverSql` and that it is shared by `COVER_JOIN` and `listAllPhotos`. Note the `coverState` field on `PhotoTableRow`. Explain that `cover_photo_id` is written by the seed script, by `deletePhoto` promotion and by the new functions. Refresh the drifted line numbers.
- `docs/wiki/codebase/admin-auth.md`: add `POST`/`DELETE /admin/photos/:photoId/cover` to the session-route guard list. Note that they have no body (the empty-JSON-body gotcha).
- `docs/wiki/codebase/admin-photos-page.md`: add the routes, the cover badge and button in the Image cell, the new pure helpers (`coverAction`, `applyAlbumCover`), `#photos-cover-status`, and that `refreshFromServer` syncs `coverState`. Fix the route line numbers.
- `docs/wiki/codebase/album-detail-page.md`: the menu now has two items. Note the measured clamping (no more `menuH`) and the `[data-admin-status]` live region in the admin strip.
- `docs/wiki/codebase/testing.md`: list the new describe blocks in the existing-files table.
- `docs/wiki/codebase/README.md`: add a one-line update stamp.

---

## Open questions (with chosen defaults)

| # | Question | Default chosen |
| --- | --- | --- |
| Q1 | Reset API shape: a body flag, `DELETE …/cover`, or an album-scoped route? | `DELETE /admin/photos/:photoId/cover`. The photo identifies the album, and the reset is unconditional and idempotent for that album. The client never sends an album id. |
| Q2 | 204 (hls.md) or 200 + JSON? | **200 + `{ albumId, coverPhotoId, pinned }`**. The portal needs the effective cover after a reset (C1). |
| Q3 | The auto-cover subquery has no tie-break. Should we add one? | Add `created_at DESC, id ASC` to the shared fragment. This can change the `/` card only for albums whose latest photos share an identical `taken_at`. The change is accepted, because it makes the marker and the card always agree. |
| Q4 | R8: deleting a **pinned** cover promotes the most recently *uploaded* photo (`created_at`) and **pins** it. This is not the same as the automatic rule (most recently *taken*). Keep it? | Keep it unchanged, as R8 requires, and cover it with a test. Flag to the owner: falling back to automatic (`NULL`) might match intent better after this feature. That is a separate change. |
| Q5 | Should the long-press menu also offer "Reset to automatic" and show whether the photo is the current cover (PRD story 3 on the album page)? | No. The album page only **sets** the cover (R1). Viewing the cover state and resetting it happen in `/admin/photos` (R2, R5, R6). This avoids adding cover state to `showcasePage` markup. |
| Q6 | Seeded albums have a pinned `cover_photo_id`, so they show "Cover" (pinned), not "Cover · auto". | Accept this. It is accurate data. "Reset to auto" is available on those rows. |
| Q7 | Where should the portal controls go: a new column or the Image cell? | The Image cell. This keeps the seven-column header, the column-order test and the mobile card layout unchanged. |
| Q8 | Success feedback on the album page? | A text-only `role="status"` message in the admin strip that clears after 3 s. Failures keep using `alert()`, as Delete does (PRD decision). |
