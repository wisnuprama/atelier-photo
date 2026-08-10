# Admin auth — two independent mechanisms

Both route plugins mount under `/admin` (see
[directory-structure.md](directory-structure.md)) but authenticate differently.

## (a) HMAC — machine/CLI/iOS Shortcut — `src/server/plugins/hmac-auth.ts:26`

`verifyHmac(request, rawBody): void`, signature =
`HMAC-SHA256(ADMIN_HMAC_SECRET, "${X-Timestamp}." + rawBodyBytes)`, headers
`X-Key-Id` / `X-Timestamp` / `X-Signature`, ±5 min skew.

Applied scope-wide in `src/server/routes/admin.ts:87-90` via
`app.addHook("preValidation", ...)`, over a raw-buffer content-type parser
registered at `admin.ts:78-84` (`multipart/form-data`, `parseAs: "buffer"`,
`bodyLimit: MAX_BODY` = 60 MB, `admin.ts:10`).

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

Guard pattern used in every session route (`auth.ts:93, 109, 121, 146, 179`):

```ts
if (!getAdminSession(request)) return reply.code(401).send({ error: "Unauthorized" });
```

…or, for HTML pages,
`return reply.redirect("/admin/login?next=/admin/photos")` (`auth.ts:110`).

## Admin detection in views

The route computes `const isAdmin = getAdminSession(request)` and passes it
into the view (`src/server/routes/pages.ts:48-52`). No client-side admin flag
exists; client JS keys off SSR-emitted `data-admin-photo` attributes (see
[album-detail-page.md](album-detail-page.md)).

## ⚠️ Route-collision constraint

`POST /admin/albums` (`admin.ts:92`) and `POST /admin/photos` (`admin.ts:112`)
are already claimed by the HMAC scope. Fastify throws on duplicate
METHOD+path, so new session-based endpoints must use different paths (e.g.
`POST /admin/albums/create`, `POST /admin/albums/:albumId/photos`, or
`POST /admin/upload`). `GET /admin/photos` coexists fine with
`POST /admin/photos` (different method).
