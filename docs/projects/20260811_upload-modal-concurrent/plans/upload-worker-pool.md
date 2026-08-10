# Upload modal: concurrent uploads via client worker pool

## Problem

The admin upload modal uploaded files strictly sequentially: `drain()` in
`src/client/ts/upload.ts` awaited each `XMLHttpRequest` before starting the
next, so network transfer and server-side ingest never overlapped across
files. Batch time was `Σ(upload_i + ingest_i)`.

## Decision

Add concurrency **client-side only**, with a small fixed worker pool.

- `MAX_CONCURRENT_UPLOADS = 3` exported from `upload.ts`. A `pump()` function
  starts queued uploads until 3 are in flight; each settled upload calls back
  into `pump()` to start the next. New drops while uploads run extend the
  queue as before.
- Per-file row UI (status text, progress bar) is unchanged — each row already
  owns its own elements. `setBusy`/modal lock now spans "any upload in
  flight" (`active > 0`) instead of "drain loop running".
- **No server changes.** `POST /admin/photos/upload` already accepts parallel
  requests; `ingestLimit` (`INGEST_CONCURRENCY`, default 1) serializes the
  heavy sharp work, so parallel uploads overlap network transfer with ingest
  without extra CPU pressure.

## Why the pool is capped at 3

- Each in-flight request buffers its full body (up to 60 MB) in server RAM
  (raw-buffer multipart parser).
- `ingestPhoto` has check-then-insert sections (`uniqueSlug`, `ensureAlbum`,
  replace-detection) that are safe only because the ingest limiter serializes
  whole ingest calls at concurrency 1. `INGEST_CONCURRENCY` must stay 1
  unless those are hardened; the client pool does not change that.

## Touched files

- `src/client/ts/upload.ts` — worker pool replaces the sequential drain loop.
- `src/server/routes/auth.ts` — route comment updated (no behavior change).
- `docs/wiki/codebase/album-detail-page.md`,
  `docs/wiki/codebase/multipart-uploads.md` — docs updated.
