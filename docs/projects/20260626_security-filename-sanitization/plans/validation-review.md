# Validation Review — Filename Sanitization & Shell-Op Audit

## Context

Reviewing `what-do-u-think-concurrent-crown.md`, a security audit of all
shell/filesystem operations in the photo service. This document records the
result of independently re-deriving every claim against the current source,
plus the corrections needed before the audit's fixes are implemented.

**Verdict:** The audit is substantially correct. Both findings are real, and the
entire "already safe" table checks out against the code. However, the proposed
**fix for Finding 1 is internally inconsistent with its own proposed test**, and
the `basename` approach leaves two edge cases open. Those need to be resolved
before implementation. Details below.

---

## Finding 1 — Path traversal via `input.filename` — **CONFIRMED (real)**

Traced end to end:

- `info.filename` from busboy → `files[].filename` (`src/server/routes/admin.ts:27`)
  → passed as `filename: file.filename` into `ingestPhoto` (`admin.ts:116`).
- Reaches `writeFile(`${originalDir}/${input.filename}`, …)` at
  `src/server/services/photos.ts:356`. A value of `../../…` escapes the
  `originals/<photoId>/` tree. **Confirmed exploitable** given a valid HMAC
  credential.
- The same raw value also feeds: the dedup `SELECT` (`photos.ts:338`, bound at
  `:340`), the slug derivation `parsePath(input.filename).name` (`:347`), and the
  `@filename` INSERT bind (`:391`). The audit's list of consumers is complete and
  accurate.

So the core diagnosis and the "sanitise once, use everywhere" direction are right.

### ⚠️ Problem with the proposed fix (must fix before implementing)

The audit proposes `const safeFilename = basename(input.filename)` (silently
**strips** path components), then proposes a unit test asserting that
`ingestPhoto({ filename: "../escape/evil.jpg" })` **throws**. These contradict:
`basename("../escape/evil.jpg") === "evil.jpg"`, so the ingest would *succeed*,
and the proposed test would *fail*. The code comment in the fix ("Reject
filenames that carry path components") also says reject, not strip.

Two further gaps in the `basename`-only approach:

- `basename("..") === ".."` and `basename(".") === "."` — neither is caught by
  the proposed `if (!safeFilename)` empty-check. `${originalDir}/..` resolves to
  the parent dir; harmless in practice (write would `EISDIR`), but it defeats the
  point of a defence-in-depth guard.
- POSIX `basename` does not treat `\` as a separator. Not exploitable on the
  Linux deployment target (backslash is a normal filename char there), so this is
  a note, not a blocker.

### Recommended fix (reject, don't strip)

Rejecting is stricter, matches the audit's own comment and test, and is safe:
legitimate clients (the iOS Shortcut contract) only ever send a bare filename in
`Content-Disposition`, never a path. At the top of `ingestPhoto`, after the
existing guard at `photos.ts:324`:

```typescript
const safeFilename = basename(input.filename);
if (safeFilename !== input.filename || safeFilename === "." || safeFilename === "..") {
  throw new Error("ingestPhoto: filename must not contain path components");
}
```

Then replace `input.filename` with `safeFilename` at the four consumer sites
(`photos.ts` lines 340, 347, 356, 391), exactly as the audit describes. Add
`basename` to the existing `import { parse as parsePath } from "node:path"`.

With this version, the audit's proposed test (`"../escape/evil.jpg"` → throws,
clean filename → succeeds) is correct as written.

---

## Finding 2 — `rm` should use DB-returned id — **CONFIRMED, but purely cosmetic**

Accurate as described (`photos.ts:439–442` use the raw `photoId` param), but note
its security value is **zero, not just "low"**: `deletePhoto` reaches the `rm`
calls only after `SELECT id FROM photos WHERE id = ?` matched a row
(`photos.ts:414–421`). SQLite compares the TEXT `id` exactly, so a matched row
guarantees `existing.id === photoId` — they are the same string. The change is a
style/habit improvement with no behavioral difference. Harmless to include;
should not be sold as a security fix.

---

## "What is already safe" table — **ALL VERIFIED**

Each row independently confirmed:

| Claim | Verified at |
|---|---|
| `rm` in `deletePhoto` gated by DB lookup | `photos.ts:414–421` then `:439` ✓ |
| Media route validates `photoId` via `getPhoto` before path build | `media.ts:32–34` before `derivativePath` at `:43` ✓ |
| SQL fully parameterised | all queries use `?` / `@named` binds; no interpolation of user input ✓ |
| `?next=` open-redirect handled | GET escapes via `esc(next)` in hidden input (`admin-login.ts:13`); POST validates `startsWith("/") && !startsWith("//")` (`auth.ts:42`) ✓ |
| `variant` checked against allowlist | `DERIVATIVE_NAMES.has(variant)` (`media.ts:28`) ✓ |
| HMAC/session timing-safe + ±5 min window | `timingSafeEqual` via `safeEqual`, `MAX_SKEW_MS = 5*60*1000` (`hmac-auth.ts:6,17,43`) ✓ |

No additional user-controlled path-construction sinks were found beyond the one
in Finding 1. Coverage of the audit is complete.

---

## Net recommendation

Proceed with implementation, with these adjustments to the original audit:

1. **Finding 1**: implement as **reject** (code above), not silent `basename`
   strip — this resolves the fix/test contradiction and closes the `.`/`..`
   edge cases. Keep the four consumer-site replacements as listed.
2. **Finding 2**: optional cleanup; include it but describe it as a style
   improvement, not a security fix.
3. **Tests**: the audit's two proposed cases are correct *once the reject-based
   fix is used*. Note `node:fs/promises` is already mocked in
   `photos.test.ts:8–12`, so the throw-path test runs without touching disk; the
   success-path regression test will exercise the mocked `mkdir`/`writeFile`.

### Verification (unchanged from audit, valid)

1. `pnpm test` — new `ingestPhoto` cases in `photos.test.ts`.
2. `pnpm typecheck` — only change is the `basename` import + guard.
3. Manual: `pnpm dev`, upload via admin UI, confirm file lands at
   `data/originals/<uuid>/<filename>`.
