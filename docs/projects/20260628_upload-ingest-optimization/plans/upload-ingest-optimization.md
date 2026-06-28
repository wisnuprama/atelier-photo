# Upload / Ingest Pipeline Optimization — Implementation Plan

Implements the PRD in `../PRD.md`. Three independent changes, each its own
commit: (1) decode-once derivatives, (2) bounded-concurrency ingest, (3) sharp
runtime tuning.

## Deployment target — 2 vCPU / 2 GB RAM

All tuning values below are sized for this container. **Memory is the binding
constraint, not CPU.** Rough peak per photo in flight: ~60 MB buffered request
body + busboy's per-file copy + libvips working set (parallel decode/EXIF/
thumbhash) ≈ 200–300 MB, on top of a ~150 MB Node/Fastify/sqlite baseline. That
budget only allows a *small* number of photos decoding at once before risking
OOM. Note libvips native memory is **off-heap**, so `--max-old-space-size` does
not bound it — `sharp.cache(false)` and the ingest limiter are what actually
cap it. Chosen budget:

| Knob | Value | Why |
| --- | --- | --- |
| `INGEST_CONCURRENCY` | **1** | One photo decoding at a time → predictable, low peak RSS. |
| `sharp.concurrency` | **2** | That one photo uses both cores, so it's still fast. |
| `UV_THREADPOOL_SIZE` | **4** | Covers libvips threads + fs writes; modest. |
| `sharp.cache` | **off** | Stops libvips retaining decoded inputs (off-heap). |
| `--max-old-space-size` | **1024** | Caps Node heap, leaving ~700 MB for native sharp + OS. |

Invariant: keep `INGEST_CONCURRENCY × sharp.concurrency ≤ 2` (cores) so ingest
never fully starves request serving. The alt split (`INGEST=2`,
`sharp.concurrency=1`) overlaps bulk better but raises peak memory — rejected for
2 GB.

## Affected files

- `src/server/services/derivatives.ts` — decode-once rework (FR1, FR2).
- `src/server/services/concurrency.ts` — **new** in-process limiter (FR3).
- `src/server/routes/admin.ts` — run files through the limiter (FR3).
- `src/server/app.ts` — sharp tuning at boot (FR4).
- `package.json` / start script — `UV_THREADPOOL_SIZE` env (FR4).
- `src/server/services/photos.test.ts` — extend coverage (NFR4).

---

## Step 1 — Decode each original once (`derivatives.ts`)

**Today:** `generateDerivatives` calls `sharp(original)` 6× (2 sizes × 3
formats), fully re-decoding the original each time (`derivatives.ts:67-77`).

**Change:** decode + orient once, downscale to the **largest** spec into a raw
intermediate, then derive every size/format from that small in-memory bitmap.

```ts
export async function generateDerivatives(ctx, photoId, original) {
  const dirPath = path.join(paths.derivatives, photoId);
  await mkdir(dirPath, { recursive: true });

  // Largest first so smaller sizes resize down from the intermediate.
  const specs = [...DERIVATIVES].sort((a, b) => b.maxEdge - a.maxEdge);

  // One full decode of the original; orientation baked in here.
  const { data, info } = await sharp(original)
    .rotate()
    .resize(specs[0].maxEdge, specs[0].maxEdge, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const intermediate = { data, raw: { width: info.width, height: info.height, channels: info.channels } };

  for (const spec of specs) {
    // No re-rotate: the intermediate is already oriented.
    const sized = sharp(intermediate.data, { raw: intermediate.raw })
      .resize(spec.maxEdge, spec.maxEdge, { fit: "inside", withoutEnlargement: true });
    for (const format of DERIVATIVE_FORMATS) {
      const buffer = await format.encode(sized.clone()).toBuffer();
      const finalPath = derivativePath(photoId, spec.name, format.ext);
      const tmpPath = `${finalPath}.tmp`;
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, finalPath);
      ctx.log.info({ photoId, variant: spec.name, format: format.ext, bytes: buffer.length },
        "generateDerivatives: wrote derivative");
    }
  }
}
```

Notes / invariants:
- **Decodes drop 6 → 1** of the full original; smaller sizes resize from the
  ≤2400px intermediate, which also lowers peak memory vs. holding the full
  bitmap repeatedly.
- `.rotate()` applied **only** when producing the intermediate — the raw bitmap
  is already oriented, so later steps must not rotate again.
- `withoutEnlargement` preserved at every step, so no spec ever upscales beyond
  the original (behavior unchanged).
- Atomic temp-then-rename writes and per-derivative logging unchanged.
- Accepted minor change: the thumb now downsamples from the 2400px intermediate
  rather than the original — standard two-step downscale, visually negligible.
- Remove the `TODO: optimize the performance` comment.

---

## Step 2 — Bound ingest concurrency (`concurrency.ts` + `admin.ts`)

**Today:** nothing caps concurrent processing. The route loops files
sequentially (`admin.ts:119`), but multiple requests run fully in parallel, each
holding the 60 MB body + sharp buffers → unbounded memory.

**New util — `src/server/services/concurrency.ts`** (no dependency, ~20 lines):

```ts
/** Bound the number of concurrently running async tasks; excess tasks queue. */
export function createLimiter(max: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const pump = () => {
    while (active < max && queue.length > 0) {
      active++;
      queue.shift()!();
    }
  };
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn().then(resolve, reject).finally(() => { active--; pump(); }),
      );
      pump();
    });
  };
}
```

**Wire-up in `admin.ts`** — one module-level limiter shared across all requests,
and dispatch a request's files through it concurrently (bulk uploads now use the
budget instead of running strictly one-at-a-time):

```ts
const MAX_CONCURRENT_INGEST = Number(process.env.INGEST_CONCURRENCY ?? 1);
const ingestLimit = createLimiter(MAX_CONCURRENT_INGEST);

// in POST /photos:
const results = await Promise.all(
  files.map((file) =>
    ingestLimit(() =>
      ingestPhoto(ctx, {
        album: fields.album, filename: file.filename,
        title: fields.title, commentary: fields.commentary, data: file.data,
      }),
    ),
  ),
);
const created = results.filter((r) => r.status === "created").length;
const replaced = results.length - created;
```

Notes:
- The limiter is **process-wide** (module scope), so the cap holds across
  concurrent requests, not just within one — this is the core resource guard.
- Default `1` for the 2 GB target, override via `INGEST_CONCURRENCY`. No value
  hard-coded in logic. With the default, a bulk request still streams its files
  through one at a time, but two concurrent admin requests can no longer stack
  their decode buffers.
- Response shape (`{ status, created, replaced, photos }`) unchanged. `photos`
  preserves input order because `Promise.all` preserves array order.
- Note: this does not cap the inbound request body buffering (Fastify still
  buffers each request up to `MAX_BODY`); it caps the heavy decode/encode work,
  which is the dominant memory + CPU cost.

---

## Step 3 — Tune sharp at startup (`app.ts` + start env)

**Today:** sharp runs with defaults — on a 2-core box libvips grabs both cores
per op and keeps an input cache; no `UV_THREADPOOL_SIZE` set.

**In `app.ts` (top of `buildApp`, before routes):**

```ts
import os from "node:os";
import sharp from "sharp";

sharp.cache(false);                                  // don't retain decoded inputs (off-heap)
sharp.concurrency(Math.min(2, os.cpus().length));    // 2 cores → 2 libvips threads per op
```

**`UV_THREADPOOL_SIZE` and the Node heap cap** must be set **before** the process
starts (libuv and V8 read them at init; setting them in JS afterward is a no-op).
Set them on the start command, not in code:

```json
"start": "UV_THREADPOOL_SIZE=4 node --max-old-space-size=1024 dist/server/server.js"
```

(and mirror it in the Containerfile/quadlet env for production).

Notes:
- `concurrency` (libvips threads per op) and the ingest limiter (Step 2) compose:
  with `INGEST_CONCURRENCY=1 × sharp.concurrency=2 = 2`, ingest uses both cores
  for the single in-flight photo and no more — request serving resumes between
  photos.
- Mirror `UV_THREADPOOL_SIZE` and `--max-old-space-size` in the
  Containerfile/quadlet env so production matches local.
- Values are sized for 2 vCPU / 2 GB (see the budget table up top); revisit if
  the container is resized.

---

## Testing & verification

- `pnpm typecheck`, `pnpm lint`, `pnpm test` after each step.
- **Step 1:** existing ingest tests must pass; assert all 6 derivative files
  still exist with valid headers and correct (≤ maxEdge) dimensions, and that an
  orientation-tagged fixture lands right-side-up exactly once.
- **Step 2:** unit-test `createLimiter` — never exceeds `max` in flight,
  preserves result order, propagates rejections. Smoke-test a multi-file ingest
  returns correct `created`/`replaced` counts.
- **Step 3:** boot the server and ingest a photo to confirm config applies with
  no regression.
- Manual: bulk-ingest a folder, watch RSS stays bounded vs. `main`.

## Rollout

Three small PRs/commits in order (1 → 2 → 3); each is independently revertible.
No schema migration, no API change, no new runtime dependency.

## Risks

- **Two-step downscale quality** (Step 1): mitigated by lanczos default;
  spot-check a thumb against `main`.
- **Limiter starvation/deadlock** (Step 2): the limiter only wraps
  `ingestPhoto`, which has no nested call back into the limiter, so no deadlock.
- **`UV_THREADPOOL_SIZE` not applied** if set in code instead of env — call out
  in review that it must live on the start command / container env.
