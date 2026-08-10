# Directory structure

Fastify SSR photo gallery. TypeScript ESM, better-sqlite3, template-literal
views, vanilla client TS bundled with esbuild. See `CLAUDE.md` for stack rules.

```
src/server/
  server.ts            entry (listen)
  app.ts               buildApp(): plugin + route registration
  config.ts            env config + `paths` (db/originals/derivatives)
  context.ts           `Ctx { log }` lightweight DI
  db/{index.ts, migrate.ts, schema.sql, seed.ts}
  plugins/{hmac-auth.ts, session.ts, rate-limit.ts}
  routes/{pages.ts, api.ts, media.ts, admin.ts, auth.ts}
  services/{photos.ts, derivatives.ts, exif.ts, thumbhash.ts, concurrency.ts, csv.ts}
  views/{layout.ts, albums.ts, showcase.ts, admin-photos.ts, admin-login.ts, contact.ts, icons.ts, util.ts}
src/client/
  css/app.css          Tailwind v4 @theme tokens + component CSS
  ts/{main.ts, admin.ts, admin-photos.ts, viewer.ts, showcase.ts, lazyload.ts, nav.ts, thumbhash.ts}
scripts/{esbuild.js, copy-assets.js, upload-photo.ts, create-album.ts}
docs/projects/YYYYMMDD_slug/plans/*.md   (CLAUDE.md mandates this layout)
```

## Route mounting — `src/server/app.ts:42-46`

```ts
await app.register(pageRoutes);
await app.register(mediaRoutes);
await app.register(apiRoutes,   { prefix: "/api" });
await app.register(authRoutes,  { prefix: "/admin" });   // session cookie auth
await app.register(adminRoutes, { prefix: "/admin" });   // HMAC auth
```

Note `authRoutes` and `adminRoutes` share the `/admin` prefix but use different
auth mechanisms — see [admin-auth.md](admin-auth.md).

Registered plugins (`app.ts`): `@fastify/static` (root `public/`, prefix `/`,
`:36`), `@fastify/cookie`, `@fastify/rate-limit`. Deps also include `jszip`,
`papaparse`, `sharp`, `exifr`, `thumbhash`, `better-sqlite3`, `lucide-static`.
