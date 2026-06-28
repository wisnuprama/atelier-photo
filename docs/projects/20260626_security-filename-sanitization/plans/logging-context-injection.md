# Plan — Lightweight `Ctx` Dependency Injection for Logging (Solution A)

## Context

Follow-up to the filename-sanitization work. The `deletePhoto` cleanup now logs
failed directory removals, but it uses `console.error`, which bypasses Fastify's
pino logger (no log-level control, no per-request `reqId` correlation). Services
in this repo have no access to the logger — it lives only on `request.log` /
`app.log`.

We chose **Solution A**: a tiny explicit dependency-injection object (`Ctx`)
threaded from routes into services, so a service uses the same per-request pino
logger the rest of the server uses. Scoped to the only function that logs today
(`deletePhoto`); the pattern can be extended to other services as they grow
logging needs.

## Changes

### 1. `src/server/context.ts` (already created)

Defines the DI seam:
- `interface Ctx { log: FastifyBaseLogger }`
- `ctxFromRequest(request)` → `{ log: request.log }` (reuses the per-request child logger with `reqId`)
- `consoleCtx` → `{ log: console as unknown as FastifyBaseLogger }` for non-request callers (CLI scripts, tests)

### 2. `src/server/services/photos.ts`

- Import `Ctx` from `../context.js`.
- Change `deletePhoto(photoId: string)` → `deletePhoto(ctx: Ctx, photoId: string)` (ctx first, like a conventional context param).
- Replace the `console.error(...)` in the `removeDir` catch with structured pino logging:
  ```ts
  ctx.log.error({ err, dir, photoId: confirmedId }, "deletePhoto: failed to remove directory");
  ```

### 3. `src/server/services/photos.test.ts`

- Import `consoleCtx` from `../context.js`.
- Update the 6 `deletePhoto(...)` call sites to pass `consoleCtx` as the first arg, e.g. `deletePhoto(consoleCtx, "p1")`.

### Note on route callers

`deletePhoto` currently has **no route caller** (only tests invoke it); `admin.ts`
only calls `ingestPhoto`/`createAlbum`. When a delete route is added, it should
build the ctx via `ctxFromRequest(request)` and pass it in. `ingestPhoto` does not
log today, so it keeps its current signature; adopt the same `ctx`-first pattern
if/when it needs logging.

## Verification

1. `pnpm typecheck` — passes (new param + import only).
2. `pnpm test` — all `deletePhoto` tests pass with `consoleCtx` injected.
3. Spot-check: the cleanup-failure path logs via `ctx.log.error` (pino) instead of `console`.
