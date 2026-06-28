# Final Plan — Filename Sanitization & Shell-Op Hardening

## Context

A security audit of every shell/filesystem operation in the photo service
(`what-do-u-think-concurrent-crown.md`) found one real path-traversal
vulnerability and one defence-in-depth nicety. An independent validation review
(`review-and-validate-the-jolly-hickey.md`) confirmed both findings against the
source, verified the full "already safe" table, and corrected the proposed fix
for the real bug (it must **reject**, not silently strip — the original
`basename` strip contradicted its own test and left `.`/`..` open).

This document is the agreed, executable plan. All line numbers below were
re-verified against the current `src/server/services/photos.ts`.

Outcome: user-controlled filenames can no longer influence path construction on
disk, closing the traversal sink while keeping idempotent dedup behaviour intact.

---

## Finding 1 — Path traversal via `input.filename` (HIGH) — the real fix

`input.filename` originates from the multipart `Content-Disposition` header
(`src/server/routes/admin.ts:27`, passed at `admin.ts:116`) and flows unmodified
into `writeFile(`${originalDir}/${input.filename}`, …)` at `photos.ts:356`. A
caller with a valid HMAC credential can send `filename: "../../../etc/cron.d/evil"`
and write outside the `originals/<photoId>/` tree.

The same raw value also feeds three other consumers, so the sanitised value must
flow consistently:
- dedup `SELECT … WHERE filename = ?` bind — `photos.ts:340`
- slug derivation `parsePath(input.filename).name` — `photos.ts:347`
- `@filename` INSERT/upsert bind — `photos.ts:391`

### Change

In `ingestPhoto`, immediately after the existing guard at `photos.ts:324–326`,
sanitise once with a **reject** policy:

```typescript
const safeFilename = basename(input.filename);
if (safeFilename !== input.filename || safeFilename === "." || safeFilename === "..") {
  throw new Error("ingestPhoto: filename must not contain path components");
}
```

Then replace `input.filename` with `safeFilename` at the four consumer sites
(`photos.ts:340, 347, 356, 391`).

Add `basename` to the existing import at `photos.ts:3`:

```typescript
import { basename, parse as parsePath } from "node:path";
```

Reject (not strip) is correct here: the only legitimate client (the iOS Shortcut
contract) always sends a bare filename in `Content-Disposition`, never a path.
Rejecting matches the test below and closes the `.`/`..` edge cases that a bare
`basename` strip would let through.

---

## Finding 2 — `rm` should use the DB-returned id (cosmetic, not a security fix)

`deletePhoto` (`photos.ts:412–442`) reaches its `rm` calls only after
`SELECT id FROM photos WHERE id = ?` matched a row, so `existing.id === photoId`
is guaranteed — the change has **zero** behavioural/security effect. Include it
only as a "use the value the DB returned" habit improvement.

### Change

```typescript
const confirmedId = existing.id;
await Promise.all([
  rm(`${paths.originals}/${confirmedId}`, { recursive: true, force: true }).catch(() => {}),
  rm(`${paths.derivatives}/${confirmedId}`, { recursive: true, force: true }).catch(() => {}),
]);
```

(`photos.ts:439–442`.)

---

## Already safe — no changes (verified in both docs)

Media-route `photoId` (gated by `getPhoto` before any path build), all SQL
(fully parameterised `?`/`@named` binds), `?next=` open-redirect handling,
`variant` allowlist (`DERIVATIVE_NAMES.has`), and HMAC/session auth
(timing-safe, ±5 min window). No other user-controlled path-construction sinks
exist.

---

## Files to change

| File | Change |
|---|---|
| `src/server/services/photos.ts` | Add `basename` to `node:path` import; add reject guard in `ingestPhoto`; swap four `input.filename` → `safeFilename`; use `existing.id` in `deletePhoto` rm calls |
| `src/server/services/photos.test.ts` | Add two `ingestPhoto` cases (see below) |

No new files, no schema changes, no route changes.

---

## Tests

Add to `src/server/services/photos.test.ts` (note: `node:fs/promises` is already
mocked at lines 8–12, so neither case touches disk; import `ingestPhoto`
alongside the existing `deletePhoto` import at line 35):

1. `ingestPhoto({ filename: "../escape/evil.jpg", data: <non-empty buffer> })`
   **throws** (`/path components/`).
2. A clean filename (e.g. `photo.jpg`) still **succeeds** and returns
   `status: "created"` — regression guard exercising the mocked
   `mkdir`/`writeFile`.

## Verification

1. `pnpm test` — new `ingestPhoto` cases pass; existing `deletePhoto` suite
   stays green.
2. `pnpm typecheck` — passes (only change is the `basename` import + guard).
3. Manual smoke: `pnpm dev`, upload a photo via the admin UI, confirm the file
   lands at `data/originals/<uuid>/<filename>` and a normal upload still works.
