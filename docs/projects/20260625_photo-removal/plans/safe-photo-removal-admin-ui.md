# Plan: Safe Photo Removal via Admin UI

## Context

Photos can currently be uploaded and replaced, but there is no way to remove them from the
gallery. The original plan was a bare `DELETE /admin/photos/:photoId` endpoint driven by a CLI
script, but that requires knowing the photo ID out-of-band and hand-crafting HMAC signatures.

The better UX: an admin login page that authenticates with the same HMAC credentials (Key ID +
Secret from env), stores a signed session cookie, and then surfaces delete buttons directly on
the album page. The photo ID is never something the user has to find manually — the UI already
knows it.

"Safely" still means the same three things:
1. **No broken references** — `albums.cover_photo_id` has no FK constraint; must be nulled
   explicitly before deleting a photo.
2. **No orphaned files** — `data/originals/<photoId>/` and `data/derivatives/<photoId>/` cleaned
   up after a successful DB delete.
3. **Authenticated** — only valid admin sessions can trigger deletions.

---

## Approach

### 1. Session cookie design (stateless, no server-side store)

Cookie value format (pipe-delimited, all hex/base64):
```
{keyId}.{issuedAt}.{hmac}
```
- `issuedAt` — epoch ms at login time (string)
- `hmac` — `HMAC-SHA256(ADMIN_HMAC_SECRET, "admin-session:" + keyId + ":" + issuedAt)` (hex)
- Verify by recomputing the HMAC and checking `issuedAt` is within 7 days
- Cookie flags: `HttpOnly; SameSite=Strict; Path=/`; `Secure` only when `NODE_ENV=production`

One new plugin — `src/server/plugins/session.ts` — exports:
- `setAdminSession(reply, keyId)` — builds + sets the cookie
- `getAdminSession(request)` → `boolean` — verifies the cookie, returns true/false (never throws)
- `clearAdminSession(reply)` — clears the cookie on logout

Requires adding **`@fastify/cookie`** (lightweight, Fastify-native).

### 2. Admin login / logout routes (added to `src/server/routes/admin.ts`)

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/admin/login` | Renders login page (redirect to `/` if already authenticated) |
| `POST` | `/admin/login` | Verifies `keyId === ADMIN_KEY_ID && secret === ADMIN_HMAC_SECRET` (timing-safe); sets cookie; redirects to query param `?next=` or `/` |
| `POST` | `/admin/logout` | Clears cookie; redirects to `/` |

Login form fields: `keyId` (text), `secret` (password). Submitted as
`application/x-www-form-urlencoded`. No HMAC header needed on these routes — the secret is the
credential itself.

New view: `src/server/views/admin-login.ts` — minimal form page using the existing `layout()`.

### 3. `deletePhoto` service (`src/server/services/photos.ts`)

```ts
export function deletePhoto(photoId: string): void
```

1. `SELECT id FROM photos WHERE id = ?` — throw 404 error if missing.
2. SQLite transaction:
   - `UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = ?`
   - `DELETE FROM photos WHERE id = ?`
3. Set `yearRangeCache = null`.
4. Best-effort file cleanup (log warn on failure, never re-throw):
   - `fs.rm(path.join(DATA_DIR, 'originals', photoId), { recursive: true, force: true })`
   - `fs.rm(path.join(DATA_DIR, 'derivatives', photoId), { recursive: true, force: true })`

### 4. Delete endpoint (`src/server/routes/admin.ts`)

```
DELETE /admin/photos/:photoId
```

- **Auth:** `getAdminSession(request)` — returns 401 if not authenticated (no HMAC header needed
  from browser; session cookie is enough).
- Calls `deletePhoto(photoId)`.
- Returns **204 No Content** on success, **404** if not found.
- The existing HMAC header path (`verifyHmac`) stays intact on the upload routes — scripts still
  work unchanged.

### 5. Album page: admin mode (`src/server/views/showcase.ts`)

`showcasePage()` gains an `isAdmin: boolean` parameter. When true:
- Each `<figure class="photo-row">` gets a delete button:
  ```html
  <button class="delete-photo-btn" data-delete-photo data-photo-id="{photoId}"
          aria-label="Delete photo"><!-- trash icon --></button>
  ```
- A nav "Logout" link appears in the admin header strip.

The pages route (`src/server/routes/pages.ts`) calls `getAdminSession(request)` and passes the
result to `showcasePage()`.

### 6. Client JS — admin module (`src/client/ts/admin.ts`)

New module, initialised from `main.ts` alongside the existing five:

```ts
export function initAdmin(): void
```

- Finds all `[data-delete-photo]` buttons.
- On click: shows a `confirm()` dialog ("Delete this photo? This cannot be undone.").
- On confirm: `fetch('DELETE', '/admin/photos/' + photoId)` with `credentials: 'include'`.
- On 204: fades out the parent `<figure>` and removes it from the DOM.
- On error: shows `alert()` with the status.

`admin.ts` is only bundled/executed when at least one `[data-delete-photo]` element exists,
keeping the non-admin page unaffected.

---

## File-by-file changes

| File | Change |
|------|--------|
| `package.json` | Add `@fastify/cookie` dependency |
| `src/server/plugins/session.ts` | New — cookie set/get/clear helpers |
| `src/server/app.ts` | Register `@fastify/cookie` plugin |
| `src/server/views/admin-login.ts` | New — login form template |
| `src/server/views/showcase.ts` | Accept `isAdmin`, render delete buttons conditionally |
| `src/server/routes/admin.ts` | Add login/logout routes + `DELETE /admin/photos/:photoId` |
| `src/server/routes/pages.ts` | Pass `isAdmin` to `showcasePage()` |
| `src/server/services/photos.ts` | Add `deletePhoto()` |
| `src/client/ts/admin.ts` | New — delete button handlers |
| `src/client/ts/main.ts` | Call `initAdmin()` |

---

## What is NOT in scope

- Album deletion.
- Moving a photo between albums.
- Editing photo metadata (title/commentary) from the UI.
- Rate-limiting the login endpoint (personal gallery behind a private URL; add later if needed).

---

## Verification

1. `pnpm typecheck` and `pnpm lint` — clean.
2. `pnpm dev`, navigate to `/admin/login` — login form renders.
3. Submit wrong credentials — stays on login with error message.
4. Submit correct Key ID + Secret — cookie set, redirected to home.
5. Visit `/albums/:slug` — delete buttons visible on each photo.
6. Click delete on a photo → confirm → photo fades out from the page.
7. Reload `/albums/:slug` — photo is gone.
8. Check `data/originals/<photoId>/` and `data/derivatives/<photoId>/` — directories removed.
9. Check DB: `SELECT cover_photo_id FROM albums` — no references to the deleted photo ID.
10. Visit `/admin/logout` — cookie cleared; revisit album page, no delete buttons.
11. Existing HMAC CLI scripts (`pnpm dev:upload`, `pnpm dev:album`) — still work unchanged.
