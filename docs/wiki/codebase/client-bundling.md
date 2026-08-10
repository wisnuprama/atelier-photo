# Client TS bundling + view script inclusion

- Single esbuild entry: `scripts/esbuild.js:9` —
  `entryPoints: ["src/client/ts/main.ts"]`, `bundle: true`, `format: "esm"`,
  target es2022, `outfile: "public/js/app.js"`, minified unless `--watch`.
- `src/client/ts/main.ts:11-21` — `init()` calls each module's `initX()`
  guard-style; every module early-returns if its DOM anchor is absent (e.g.
  `upload.ts` returns unless `#uploadModal` exists, so admin modules are inert
  on public pages). **New client modules get added here.**
- Shared overlay helper: `modal.ts` `createModal(root)` — used by
  `album-create.ts` and `upload.ts` (see
  [album-detail-page.md](album-detail-page.md)).
- Views include exactly one script tag:
  `<script type="module" src="/js/app.js"></script>` at
  `src/server/views/layout.ts:87`. Per-page data goes in JSON islands via
  `jsonScript()` (`views/util.ts:15`) — e.g. `#viewer-data` on the album
  detail page, `#photos-data` on the admin photos page.
- Client TS can import server **types** across the boundary:
  `import type { PhotoTableRow } from "../../server/services/photos.js"`
  (`admin-photos.ts:13`).
- Static serving: `@fastify/static` root `public/`, prefix `/` (`app.ts:36`).

Related: [album-detail-page.md](album-detail-page.md) (viewer/admin modules),
[admin-photos-page.md](admin-photos-page.md) (pure-helper/DOM-wiring split),
[styling.md](styling.md) (Tailwind scans client TS for classes).
