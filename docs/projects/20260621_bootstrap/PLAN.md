# Bootstrap Plan — Photo Gallery Web

## Context

Greenfield repo for a personal, minimalist black-and-white photo gallery. Source of
truth: [`REQUIREMENTS.md`](./REQUIREMENTS.md) and the clickable prototype
[`DESIGN.html`](./DESIGN.html) (Tailwind Play CDN + vanilla JS + mock data).

This pass is **foundation only**: stand up the project skeleton, toolchain, server,
DB schema, build pipeline, and container so the app runs end-to-end with _stubbed_
features. Feature logic (real ingestion, derivative generation, full viewer behavior)
is scaffolded with clear interfaces + TODOs, to be filled in later passes.

Decisions locked with the user:

- **Scope:** foundation/scaffolding only.
- **Frontend:** vanilla TS + **Fastify SSR** (server renders HTML; vanilla client TS
  for interactivity), compiled Tailwind. No SPA framework — honors the
  "web standards / plain CSS / lightweight" requirement.
- **Admin auth:** API key + **HMAC-signed** requests (replay-protected).
- **Package manager:** **pnpm**.

## Stack

- **Runtime:** Node 24 LTS, **TypeScript 6**, **ESM** throughout (`"type":"module"`).
- **Server:** Fastify. `@fastify/static` (assets + media), `@fastify/multipart`
  (bulk upload, wired but stubbed).
- **DB:** **`better-sqlite3`** (synchronous, battle-tested API). Note: native
  module — compile in the Containerfile build stage (build toolchain present there).
- **Images:** `sharp` (resize/derivatives + decode), `exifr` (EXIF extraction),
  `thumbhash` (encode at ingest; decode helper on client).
- **CSS:** **Tailwind v4** compiled via `@tailwindcss/cli` (CSS-first `@theme`),
  not the Play CDN.
- **Icons:** `lucide-static` (inline SVG into SSR markup — no client icon runtime).
- **Client bundling:** `esbuild` (TS → `public/js`).
- **Dev/quality:** `tsx` (dev server), `tsc --noEmit` (typecheck), **oxlint** +
  **oxfmt**.
- **Package manager:** **pnpm** (`pnpm-lock.yaml`, `packageManager` field, `.npmrc`).
- **Container:** **Podman** Containerfile + named volume + quadlet `.container` unit.

## Project structure

```
package.json  tsconfig.json  .oxlintrc.json  .npmrc  tailwind input css
src/
  server/
    server.ts            # entrypoint (listen)
    app.ts               # Fastify factory (plugins, routes)
    config.ts            # env: PORT, DATA_DIR, ADMIN_KEY_ID, ADMIN_HMAC_SECRET
    db/
      index.ts           # better-sqlite3 connection (singleton)
      schema.sql         # tables + indexes
      migrate.ts         # apply schema on boot
      seed.ts            # dev seed (stub albums/photos so SSR renders)
    plugins/
      hmac-auth.ts       # preHandler: verify HMAC on /admin/*
    routes/
      pages.ts           # SSR: GET / (albums), GET /albums/:id (showcase)
      media.ts           # GET /media/:photoId/:variant  (serve derivatives)
      api.ts             # JSON API (stub; for progressive enhancement)
      admin.ts           # POST /admin/photos (ingest, HMAC) — stubbed
    services/
      photos.ts          # ingestPhoto()/replace — interface + TODO stub
      derivatives.ts     # sharp resize pipeline — interface + TODO stub
      thumbhash.ts       # encode at ingest — interface + TODO stub
    views/
      layout.ts          # HTML shell: fonts, /css/app.css, nav, client <script>
      albums.ts          # albums grid (3->2->1), hover overlay, thumbhash box
      showcase.ts        # timeline rows + year rail + album header
  client/
    css/app.css          # @import "tailwindcss"; @theme tokens; prototype CSS
    ts/
      thumbhash.ts       # decode base64 thumbhash -> blur-up placeholder
      lazyload.ts        # IntersectionObserver swap-in
      showcase.ts        # year rail highlight/scroll, mobile year chip
      viewer.ts          # lightbox: keyboard + hardened vertical swipe, EXIF sheet
      nav.ts             # mobile menu, hairline-on-scroll
public/                  # build output: css/app.css, js/*.js  (gitignored)
data/                    # sqlite db + originals/ + derivatives/  (volume mount)
Containerfile
podman/photogallery.container   # quadlet
```

## Database schema (`src/server/db/schema.sql`)

- `albums(id PK, name, description, cover_photo_id, position, created_at)`
- `photos(id PK, album_id FK, filename, title, commentary, taken_at, width, height,
thumbhash, camera_body, lens, focal_length, aperture, shutter, iso, created_at,
UNIQUE(album_id, filename))` — `taken_at` drives most-recent sort; `width/height`
  - `thumbhash` reserve the CLS-free box.
- Index: `(album_id, taken_at DESC)`.
- "Replace on same filename" = upsert keyed on `UNIQUE(album_id, filename)`.

## Frontend (SSR + vanilla client)

- **Port `DESIGN.html` faithfully**, splitting concerns:
  - Markup → `views/*.ts` template-literal functions (no template engine). Inline
    Lucide SVGs via `lucide-static`.
  - The prototype's `<style>` block (shimmer→thumbhash, album overlay, year rail,
    lightbox, swipe hint, `:focus-visible`, `prefers-reduced-motion`) → `app.css`.
  - The prototype's `<script>` logic → `client/ts/*` modules, typed, fed by
    `data-*`/JSON instead of the mock arrays.
- **Tailwind v4 `@theme`** carries the design tokens: `paper #FFFFFF`, `ink #0A0A0A`,
  `stone #6B6B6B`, `hairline #E6E6E6`; serif Cormorant Garamond, sans Inter,
  mono IBM Plex Mono.
- **Placeholders:** SSR emits each photo's stored `thumbhash` + intrinsic
  `width/height`; `client/ts/thumbhash.ts` decodes to a blur-up, real image swaps in
  on load (replaces the prototype's generic shimmer).
- **Viewer (`viewer.ts`):** port keyboard nav, bottom safe-area toolbar, mobile EXIF
  slide-up sheet, one-time swipe hint, and the **hardened vertical-swipe** gesture
  (edge exclusion, `touch-action:none`, velocity/intent gate, on-screen fallback)
  verbatim from the prototype's logic.

## Admin ingestion (HMAC) — `plugins/hmac-auth.ts` + `routes/admin.ts`

- `preHandler` on `/admin/*`: require `X-Key-Id`, `X-Timestamp`, `X-Signature` where
  `Signature = HMAC-SHA256(ADMIN_HMAC_SECRET, timestamp + "." + rawBody)`. Reject if
  timestamp outside a ~5-min window (replay) or signature mismatch
  (`crypto.timingSafeEqual`). Secret/keyId from env/config.
- `POST /admin/photos` (multipart, bulk-capable): **stub** that validates auth +
  payload shape and calls `services/photos.ingestPhoto()`. The service interface is
  defined; real EXIF/derivative/thumbhash work is a later pass. Document the iOS
  Shortcut contract (headers + fields) in the route.

## Build & scripts (`package.json`, run via pnpm)

- `dev`: tsx watch server + tailwind `--watch` + esbuild `--watch` (concurrently).
- `build`: `tsc` (server → `dist`), tailwind compile, esbuild bundle client.
- `start`: `node dist/server/server.js`.
- `typecheck`: `tsc --noEmit`. `lint`: `oxlint`. `fmt`: `oxfmt`.
- `db:migrate` / `db:seed`.
- Add `packageManager: "pnpm@<latest>"` + `.npmrc` (`engine-strict`, optional
  `shamefully-hoist` only if a dep needs it). Containerfile uses
  `corepack enable` + `pnpm install --frozen-lockfile`.

## Project meta-setup (repo conventions)

- **`CLAUDE.md`** (repo root): stack + structure, pnpm-only workflow, ESM/TS6
  conventions, data/secrets location, the SSR + vanilla-client pattern, and the
  **plan-docs rule** (below).
- **`.claude/settings.json`**: permission allowlist to cut prompts (`pnpm *`, `tsc`,
  `oxlint`, `oxfmt`, `node`, `tailwindcss`, `esbuild`, `podman build/run`).
- **Plan-docs rule:** plan/design docs for this project always live under
  `docs/projects/Photo Gallery Web/`.
- **`.gitignore`:** `node_modules`, `dist`, `public/css`, `public/js`, `data/`,
  local env files.

## Containerization (Podman)

- **Containerfile:** multi-stage (build stage `corepack enable` +
  `pnpm install --frozen-lockfile` + `pnpm build`; slim runtime stage copies `dist`,
  `public`, `node_modules`). `node:24-slim` base.
- **Volume:** named volume mounted at `/app/data` (sqlite + originals + derivatives).
- **Quadlet:** `podman/photogallery.container` declaring image, volume, published
  port, and `ADMIN_*` env (via secret/env file).

## Verification (end-to-end skeleton)

1. `pnpm install`, `pnpm build`, `pnpm db:migrate && pnpm db:seed`.
2. `pnpm dev` → open `/`: albums grid renders SSR with seed data, thumbhash
   placeholders, hover overlay; responsive 3→2→1 across breakpoints.
3. Open an album → showcase timeline (1/row, tight spacing, year rail highlights on
   scroll, mobile year chip). Click a photo → viewer: keyboard ↑/↓/←/→/Esc, bottom
   toolbar, mobile EXIF sheet, swipe hint. Verify `prefers-reduced-motion` disables
   animation and keyboard focus rings are visible.
4. `curl` `POST /admin/photos` **without** a valid signature → 401; **with** a valid
   HMAC signature → 200 reaching the (stubbed) ingest service.
5. `tsc --noEmit`, `oxlint`, `oxfmt --check` all clean.
6. `podman build` + run via quadlet; app reachable, data persists in the volume
   across restarts.

## Out of scope this pass (later)

Real sharp derivative pipeline + EXIF extraction + thumbhash encode at ingest;
full media-serving with caching; admin replace/delete UI; bulk-upload batching;
pagination/virtualization for hundreds of photos.
