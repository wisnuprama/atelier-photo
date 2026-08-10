# Admin auth — two independent mechanisms

Both route plugins mount under `/admin` (see
[directory-structure.md](directory-structure.md)) but authenticate differently.

## (a) HMAC — machine/CLI/iOS Shortcut — `src/server/plugins/hmac-auth.ts:26`

`verifyHmac(request, rawBody): void`, signature =
`HMAC-SHA256(ADMIN_HMAC_SECRET, "${X-Timestamp}." + rawBodyBytes)`, headers
`X-Key-Id` / `X-Timestamp` / `X-Signature`, ±5 min skew.

Applied scope-wide in `src/server/routes/admin.ts:49-52` via
`app.addHook("preValidation", ...)`, over a raw-buffer content-type parser
registered at `admin.ts:40-46` (`multipart/form-data`, `parseAs: "buffer"`,
`bodyLimit: MAX_UPLOAD_BYTES` = 60 MB, from `services/multipart.ts` — see
[multipart-uploads.md](multipart-uploads.md)).

## (b) Session cookie — browser admin UI — `src/server/plugins/session.ts`

- `setAdminSession(reply)` (`:14`), `getAdminSession(request): boolean` (`:26`),
  `clearAdminSession(reply)` (`:40`)
- Cookie `admin_session = ${issuedAt}.${hmac("admin:"+issuedAt)}`, httpOnly,
  `sameSite: "strict"`, secure in prod, 2-day TTL.
- Login: `POST /admin/login` compares plain secret against `ADMIN_HMAC_SECRET`
  (`src/server/routes/auth.ts:66-85`), rate-limited `max: 3` / 5 minutes.
- **No CSRF token anywhere** — protection is SameSite=strict +
  `credentials: "include"`. Established convention; the client sends no auth
  header for session routes.
- Admins bypass all rate limiting:
  `allowList: (request) => getAdminSession(request)`
  (`src/server/plugins/rate-limit.ts:35`).

Guard pattern used in every session route (grep `getAdminSession(request)` in
`auth.ts` — delete, albums/create, photos/upload, page, patch, export, import):

```ts
if (!getAdminSession(request)) return reply.code(401).send({ error: "Unauthorized" });
```

…or, for HTML pages,
`return reply.redirect("/admin/login?next=/admin/photos")` (`auth.ts:179`).

## Session ingestion routes (browser UI)

Added in PR #14; both in `routes/auth.ts`, reusing the DAO/service layer
directly:

- `POST /admin/albums/create` (`auth.ts:121`) — JSON `{ name, description? }`
  → 201 `{ id, slug }` via `createAlbum`. 400 on blank name.
- `POST /admin/photos/upload` (`auth.ts:140`) — multipart, **exactly one file
  per request** + `album` (slug) field → 200 `IngestResult`
  (`{ id, slug, status: "created" | "replaced" }`) via
  `ingestLimit(() => ingestPhoto(...))`. 415 on non-multipart, 400 on missing
  album/file or undecodable image. The scope registers its own raw-buffer
  multipart parser (`auth.ts:66-73`) — parsers are per-plugin-scope, so this
  does not interact with the HMAC scope's parser or hook.

The one-file-per-request shape is deliberate: the browser client uploads
sequentially so each request stays far below the 60 MB body ceiling and gets
its own XHR progress + error surface (see
[album-detail-page.md](album-detail-page.md)).

## Admin detection in views

Both page routes compute `const isAdmin = getAdminSession(request)` and pass
it into the view (`src/server/routes/pages.ts` — `/` and `/albums/:slug`). No
client-side admin flag exists; client JS keys off SSR-emitted markup
(`data-admin-photo` attributes, `#albumCreateModal`, `#uploadModal` — see
[album-list-page.md](album-list-page.md) and
[album-detail-page.md](album-detail-page.md)).

## ⚠️ Route-collision constraint

`POST /admin/albums` (`admin.ts:54`) and `POST /admin/photos` (`admin.ts:74`)
are claimed by the HMAC scope. Fastify throws on duplicate METHOD+path, so
session-based endpoints use verb-suffixed paths instead — that is why the
browser routes are `POST /admin/albums/create` and
`POST /admin/photos/upload`. Follow the same convention for any new session
route whose natural path is already taken. `GET /admin/photos` coexists fine
with `POST /admin/photos` (different method).
