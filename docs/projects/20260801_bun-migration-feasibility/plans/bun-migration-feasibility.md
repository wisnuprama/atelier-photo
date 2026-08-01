# Bun Migration Feasibility

Assessment of replacing Node 24 LTS with Bun as the runtime for `atelier-photo`.

**Verdict:** technically feasible. One hard blocker (`better-sqlite3`), one
operational regression (no JS heap ceiling), and three silent-failure hazards in
the `better-sqlite3` → `bun:sqlite` swap. Estimated effort **1.5–2 days** of code
plus open-ended re-validation of the 2 GB container memory tuning.

Everything below was verified empirically against **Bun 1.3.11 (Linux x64)** by
installing the real dependency tree, shimming the DB layer to `bun:sqlite`, and
running the actual server — not from docs.

---

## 1. What already works, unchanged

The full app boots and serves traffic under Bun. Verified end-to-end:

| Area | Result |
| --- | --- |
| `bun install` of the full tree | 259 packages in **7.0 s**, `sharp` prebuilds resolved, no build toolchain needed |
| Fastify 5 + `@fastify/static` + `@fastify/cookie` + `@fastify/rate-limit` + pino | `/`, `/api/albums`, `/contact`, `/admin/login`, `/css/app.css`, `/js/app.js` → 200; `/nope` → 404 handler |
| `sharp` 0.35.2 / libvips 8.18.3 | `metadata`, `rotate`, `resize`, `raw`, `clone`, and **avif / webp / mozjpeg** encodes all pass |
| `exifr`, `thumbhash`, `papaparse`, `jszip` | pass |
| `busboy` + `node:stream` `Readable.from().pipe()` | identical output under Bun and Node |
| `node:crypto` `createHmac` / `timingSafeEqual` | HMAC admin auth verified against a signed upload |
| `createRequire(import.meta.url)` (`views/icons.ts`) | resolves `lucide-static` fine |
| **Full ingest E2E** | HMAC multipart upload → busboy → derivatives (`thumb`/`full` × `avif`/`webp`/`jpeg`) written to disk → row inserted → `/media/:id/thumb` negotiated `image/avif` 200 and `image/jpeg` 200 |
| Build tooling | `@tailwindcss/cli`, `esbuild` (run under Bun), `tsc`, `oxlint`, `oxfmt` all run |
| Cold boot from TS source, no build step | **~390 ms** to "Server listening" |

No changes were needed to Fastify, the plugins, the SSR views, the ingest
pipeline, the client bundle, or the lint/format tooling.

---

## 2. Blocker — `better-sqlite3` does not run on Bun

```
error: 'better-sqlite3' is not yet supported in Bun.
Track the status in https://github.com/oven-sh/bun/issues/4290
  code: "ERR_DLOPEN_FAILED"
```

This is not a build failure — the prebuilt `better_sqlite3.node` is present and
Bun refuses to `dlopen` it. Issue #4290 is still open. There is no workaround;
the DB layer must move to `bun:sqlite`.

### Migration surface

Small and contained: **20 `.prepare(` call sites, 15 of them with generics**,
almost entirely in `src/server/services/photos.ts`, plus `src/server/db/index.ts`
and two test files.

`src/server/db/index.ts` becomes:

```ts
import { Database } from "bun:sqlite";

connection = new Database(paths.db, { strict: true, create: true });
connection.exec("PRAGMA journal_mode = WAL");
connection.exec("PRAGMA foreign_keys = ON");
```

### API deltas found (all verified)

**a. `db.pragma()` does not exist.** Use `db.exec("PRAGMA …")`. WAL and
`busy_timeout` were confirmed working on a file-backed DB this way.

**b. `.get()` returns `null`, not `undefined`. — caused a real hang.**

Two sites compare against `undefined`:

- `src/server/services/photos.ts:378` — `albumSlugTaken`
- `src/server/services/photos.ts:491` — photo-slug dedup

Both feed `uniqueSlug` (`photos.ts:363`), whose `while (taken(...)) n++` loop
then never terminates, because `null !== undefined` is always `true`. During
testing the first end-to-end upload hung indefinitely: the POST was logged as
`incoming request` and never completed. Changing both to `!= null` fixed it and
the upload succeeded.

Note that `photos.ts:491` is line-wrapped (`!==` and `undefined` on separate
lines), so `grep '!== undefined'` **misses it**. Use a multiline search.

The rest of the accessors (`getAlbum`, `getAlbumBySlug`, `getPhoto`,
`updatePhoto`) already use truthiness (`row ? … : undefined`, `if (!existing)`),
so they are null-safe as written.

**c. Named `@param` binding silently binds NULL without `strict: true`. — the
most dangerous one.**

```js
db.prepare("insert into t values (@id,@name)").run({ id: "a", name: "x" });
// → { changes: 1, lastInsertRowid: 1 }   … and the row is stored as id = NULL
```

Bun's default mode requires the `@`/`$`/`:` prefix in the object keys. It does
not throw — it reports success and writes NULLs. The ingest INSERT
(`photos.ts:510–530`) uses exactly this shape: `@id, @albumId, @filename, …` with
bare keys. Under a naive port **every ingested photo row would be silently
NULL**.

`new Database(path, { strict: true })` fixes it and additionally restores
better-sqlite3's "missing parameter throws" behaviour (verified: `Missing
parameter "name"`). Treat `strict: true` as non-negotiable for this migration.

**d. Generic parameter order is reversed.** better-sqlite3 is
`prepare<Params, Row>`; `bun:sqlite` is `prepare<Row, Params>`. All 15 generic
call sites error until swapped, and the row interfaces need an index signature
(or the `Params` slot rejects them with `Index signature for type 'string' is
missing`). `prepare<[], Row>().get()` also becomes an arity error — the zero-arg
`.get()` calls need the `Params` generic dropped.

**e. Types.** Add `@types/bun` and `"types": ["bun", "node"]` to
`tsconfig.json`; without it `tsc` reports `Cannot find module 'bun:sqlite'`.

---

## 3. Blocker — the test runner has to change

Vitest run under `bun x vitest` still spawns **Node** workers, so `bun:sqlite` is
unresolvable inside them:

```
Error: Cannot find package 'bun:sqlite' imported from src/server/db/index.ts
Test Files  2 failed | 6 passed (8)
Tests  43 passed (43)
```

The two failures are exactly the DB-touching files (`photos.test.ts`,
`auth.test.ts`). Vitest has no supported Bun pool, so this cannot be configured
away.

**`bun test` is the practical answer.** Bun aliases `vitest` imports to
`bun:test`, so the existing `import { describe, expect, it, vi } from "vitest"`
lines do not even need rewriting. Measured:

```
bun test → 71 pass | 2 fail | 73 tests | 644 ms
vitest   → 43 pass | 2 files failed to load | 5.42 s
```

The two `bun test` failures are small:

1. `src/server/services/derivatives.test.ts:8` — `vi.hoisted` is not implemented
   in `bun:test`. One site; rewrite as a plain module-scope `mkdtempSync`.
2. `src/server/services/photos.test.ts:87` — `expect(row).toBeUndefined()`
   receives `null`. This is delta (b) again, in an assertion.

`vi.mock` (8 sites) and `vi.fn` (8 sites) work under `bun test`.

`vitest.config.ts` can be deleted; its `pool: "forks"` setting exists solely
because of the better-sqlite3 native addon.

---

## 4. Regression — the container memory tuning stops working

`Containerfile:28–33` and `docs/projects/20260628_upload-ingest-optimization`
tune the 2 vCPU / 2 GB container with `UV_THREADPOOL_SIZE=4` and
`NODE_OPTIONS=--max-old-space-size=1024`, deliberately capping the V8 heap so
libvips has off-heap headroom. **Both knobs stop working under Bun.**

`--max-old-space-size` is accepted and silently ignored:

```
node --max-old-space-size=64  → JS heap out of memory (crash)
bun  --max-old-space-size=64  → ALLOCATED ~1288 MB heap — cap NOT enforced
```

`UV_THREADPOOL_SIZE` has no effect either — Bun does not use libuv, so it does
not bound `sharp`'s async work the way it does on Node.

What survives: the app-level `INGEST_CONCURRENCY` limiter
(`services/concurrency.ts`) and `sharp.concurrency()`, both of which still work
under Bun. What is available as a replacement: `bun --smol` (JSC low-memory
mode — a hint, not a ceiling) and a hard `podman run --memory=` /
quadlet `MemoryMax=`. The difference matters: today a runaway ingest hits a
graceful V8 OOM inside the process; under Bun it becomes an OOM-kill of the
whole container.

This is the part of the migration I would actually worry about — more than any
of the code changes. The upload-ingest-optimization project exists precisely
because this tuning was non-trivial, and it would need re-validating from
scratch on a real 2 GB host.

---

## 5. Toolchain and packaging knock-ons

- **Package manager.** `CLAUDE.md` mandates pnpm. A runtime-only migration can
  keep pnpm; `bun install` also works and emits `bun.lock`. Pick one — do not
  carry both lockfiles.
- **No `node` binary in `oven/bun`.** `scripts/esbuild.js` and
  `scripts/copy-assets.js` are invoked as `node scripts/…` in `package.json`
  and would break in a Bun-only image. Both run correctly as `bun scripts/…`
  (verified).
- **Containerfile** can drop `python3 make g++` — they were only there for
  `better-sqlite3`; `sharp` uses prebuilt binaries.
- **Droppable deps:** `better-sqlite3`, `@types/better-sqlite3`, `tsx` (Bun runs
  TS directly), `vitest` (if moving to `bun test`), optionally `esbuild` →
  `bun build` (produced 18.71 KB vs esbuild's 17.90 KB — comparable) and
  `concurrently` → `bun --watch`.
- **Keep:** `@tailwindcss/cli`, `oxlint`, `oxfmt`, `husky`, `lint-staged`,
  and `tsc` for `pnpm typecheck` even if it stops emitting.
- **Also needs updating:** `.npmrc` (`use-node-version=24.16.0`,
  `engine-strict`), `.tool-versions`, `engines.node` in `package.json`, and
  `scripts/setup-toolbox.sh` (installs Node 24 + pnpm + `vips-devel`).

---

## 6. Effort

| Work | Estimate |
| --- | --- |
| DB layer → `bun:sqlite`, 20 call sites, `strict: true`, audit every `.get()` truthiness check | ~0.5 day |
| Test runner → `bun test` (`vi.hoisted` rewrite, assertion fixes, config removal) | ~2 h |
| Containerfile, quadlet, toolbox script, `.npmrc`/`.tool-versions`, docs | ~0.5 day |
| Re-validate ingest memory behaviour on a real 2 GB host | open-ended |

---

## 7. Recommendation

**Gains:** ~390 ms cold boot straight from TypeScript with no build step, ~8×
faster test runs, one fewer native addon in the image, `tsx` and the build
toolchain dropped.

**Costs:** losing the hard JS heap ceiling on a memory-constrained container that
already required a dedicated optimization project to tune, plus three
`bun:sqlite` semantic differences — two of which (silent NULL binding, `null` vs
`undefined`) fail *silently or by hanging* rather than throwing.

For a personal gallery whose hot path is libvips-bound rather than
JS-interpreter-bound, the runtime speedup is not where the time goes. The
honest cost/benefit is **thin**.

Three options, in the order I would rank them:

1. **Stay on Node 24, take the cheap wins.** Node 24 strips TypeScript types
   natively, so `tsx` can go (`node --experimental-strip-types`) for most of the
   dev-loop benefit at near-zero risk. Keeps the memory tuning intact.
2. **Full migration.** Well-scoped and provably works — the whole app served
   real traffic under Bun during this assessment — but budget the memory
   re-validation honestly, and make `strict: true` and the `.get()` audit
   gate items.
3. **Split runtimes** (Bun for dev/test, Node for prod) — not viable. It would
   mean two DB layers, since `bun:sqlite` and `better-sqlite3` cannot both be
   the import.

---

## Appendix — reproducing this

```bash
# in a scratch copy of the repo
bun install --trust
bun add -d @types/bun

# swap src/server/db/index.ts to bun:sqlite with { strict: true }
# change photos.ts:378 and photos.ts:491 from `!== undefined` to `!= null`

ADMIN_KEY_ID=test ADMIN_HMAC_SECRET=testsecret123 \
  DATA_DIR=./data PORT=3112 bun src/server/server.ts

ADMIN_KEY_ID=test ADMIN_HMAC_SECRET=testsecret123 PORT=3112 \
  bun scripts/upload-photo.ts ./photo.jpg --album bun-test --url http://127.0.0.1:3112

bun test
```
