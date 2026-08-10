# Codebase Wiki (for AI agents & developers)

Small, focused pages describing how this codebase works. Read the page you
need instead of exploring from scratch. For the user-facing guide, see the
[main wiki index](../README.md).

> Generated 2026-08-10 at v0.6.1 (commit `57366e9`); updated 2026-08-11 for
> the browser album-creation + photo-upload feature (PR #14). Line numbers are
> accurate as of that update and may drift — treat them as starting points and
> verify with grep before editing.

## Pages

- [directory-structure.md](directory-structure.md) — layout of `src/`, route mounting order
- [admin-auth.md](admin-auth.md) — the two auth mechanisms (HMAC + session cookie), route-collision constraint
- [album-list-page.md](album-list-page.md) — the `/` page: route, view, admin gaps
- [album-detail-page.md](album-detail-page.md) — `/albums/:slug`: view, admin strip, long-press menu, upload modal
- [admin-photos-page.md](admin-photos-page.md) — the `/admin/photos` editing page and its fetch conventions
- [database.md](database.md) — schema + DAO function table (`services/photos.ts`)
- [ingest-pipeline.md](ingest-pipeline.md) — `ingestPhoto` flow, derivatives, concurrency limiter
- [multipart-uploads.md](multipart-uploads.md) — busboy helper, body limits, plugin-scope gotchas
- [client-bundling.md](client-bundling.md) — esbuild entry, init pattern, JSON islands
- [styling.md](styling.md) — Tailwind tokens and copy-paste UI recipes
- [testing.md](testing.md) — vitest setup, route/service test harness patterns, gaps
