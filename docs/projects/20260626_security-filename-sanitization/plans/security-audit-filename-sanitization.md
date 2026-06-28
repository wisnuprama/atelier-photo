# Security: Filename Sanitization & Shell-Op Audit

## Context

A security audit of all shell/filesystem operations found one real path-traversal
vulnerability and one defence-in-depth improvement. Everything else (SQL queries,
session/HMAC auth, variant allowlists, media-route DB-first lookup) is already
secure. The two items below are the only fixes needed.

---

## Finding 1 — Path traversal via `input.filename` (HIGH)

**File:** `src/server/services/photos.ts` lines 354–356

```typescript
const originalDir = `${paths.originals}/${photoId}`;
await mkdir(originalDir, { recursive: true });
await writeFile(`${originalDir}/${input.filename}`, input.data);   // <- vulnerable
```

`input.filename` comes directly from the multipart `Content-Disposition` header
(`file.filename` in `src/server/routes/admin.ts:116`). A caller with a valid
HMAC credential can send `filename: "../../../../etc/cron.d/evil"` and write
outside the `originals/` tree.

The HMAC auth gate reduces exploitability to a compromised admin secret, but the
defence-in-depth rule says the filesystem layer must not trust user-controlled
strings for path construction.

The filename is also stored in the database and used for idempotent
deduplication (`WHERE album_id = ? AND filename = ?`), so the sanitised value
must flow through consistently everywhere it is used.

### Fix

At the top of `ingestPhoto`, after the existing empty-check guard (line 324),
sanitise the filename once and use it for everything below:

```typescript
// Reject filenames that carry path components.
const safeFilename = basename(input.filename);   // node:path already imported
if (!safeFilename) throw new Error("ingestPhoto: filename is empty after sanitisation");
```

Then replace every subsequent reference to `input.filename` with `safeFilename`:
- line 340 — `SELECT … WHERE filename = ?` deduplication query
- line 347 — `parsePath(…).name` slug-derivation call
- line 356 — `writeFile` path
- line 391 — `@filename` bind parameter in the INSERT/upsert

`basename` is already available from `node:path` — just add it to the existing
`import { parse as parsePath } from "node:path"` line.

---

## Finding 2 — `rm` paths should use the DB-returned id (DEFENCE-IN-DEPTH)

**File:** `src/server/services/photos.ts` lines 439–442

```typescript
await Promise.all([
  rm(`${paths.originals}/${photoId}`, ...),   // photoId = raw URL param
  rm(`${paths.derivatives}/${photoId}`, ...),
]);
```

`deletePhoto` already looks up the photo in the database first (lines 414–416)
and throws 404 if absent. Because every stored `id` is a `randomUUID()`, no
crafted value can match a DB row, so this is not exploitable in practice.
However, using the raw input string after validation is a fragile pattern; the
correct habit is to use the value returned by the database.

### Fix

Capture `existing.id` from the DB result and use it in both `rm` calls:

```typescript
const confirmedId = existing.id;   // UUID from DB, not raw user input
await Promise.all([
  rm(`${paths.originals}/${confirmedId}`, { recursive: true, force: true }).catch(() => {}),
  rm(`${paths.derivatives}/${confirmedId}`, { recursive: true, force: true }).catch(() => {}),
]);
```

---

## What is already safe (no changes needed)

| Concern | Why it is safe |
|---|---|
| `rm` in `deletePhoto` | DB lookup happens before any `rm`; only UUID values can reach the fs call |
| Media route `photoId` | `getPhoto(photoId)` called first; 404 returned before any path is constructed |
| SQL queries | All use `?` parameterised placeholders via better-sqlite3; no string interpolation |
| `?next=` open-redirect | GET `/admin/login` renders `next` only in an `esc()`-escaped hidden input; POST validates `startsWith("/") && !startsWith("//")` before redirecting |
| `variant` in media route | Checked against hardcoded `DERIVATIVE_NAMES` Set before any path use |
| HMAC / session auth | Timing-safe comparisons; HMAC-signed cookies; ±5 min replay window |

---

## Files to change

| File | Change |
|---|---|
| `src/server/services/photos.ts` | Add `basename` to `node:path` import; sanitise filename in `ingestPhoto`; use `existing.id` in `deletePhoto` rm calls |

No new files. No schema changes. No route changes.

---

## Verification

1. **Unit tests** — add to `src/server/services/photos.test.ts`:
   - `ingestPhoto` with `filename: "../escape/evil.jpg"` should throw
   - `ingestPhoto` with a clean filename still succeeds (regression)
2. **Typecheck** — `pnpm typecheck` must pass (only change is adding `basename` to the import).
3. **Manual smoke test** — run `pnpm dev`, upload a photo via the admin UI; confirm the file lands under `data/originals/<uuid>/<filename>`.
