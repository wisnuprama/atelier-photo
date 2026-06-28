# Upload / Ingest Pipeline Optimization — PRD

## Problem

The admin photo-upload endpoint (`POST /admin/photos`) decodes each original
image ~8× per photo, has no ceiling on concurrent processing, and runs `sharp`
untuned. Under bulk or concurrent uploads this wastes CPU and can exhaust
container memory. The pipeline is otherwise correct; this is a performance and
resource-safety effort, not a feature change.

## Goals

- Cut redundant image decoding per photo.
- Bound memory and CPU so concurrent/bulk uploads can't OOM the process.
- Keep ingest synchronous and the public API unchanged.

## Non-goals

- No background job queue or `202 Accepted` async ingest.
- No separate worker thread/process (`sharp` already runs off the event loop).
- No change to streaming uploads (HMAC signs the whole raw body, so the body
  must stay buffered).
- No change to the HTTP contract, auth, or output formats/sizes.

## Functional requirements

- **FR1** — `generateDerivatives` decodes each original once and derives all
  size × format outputs from that single decode (e.g. one pipeline per size,
  cloned per format).
- **FR2** — Output derivatives (sizes, formats, quality, atomic temp-then-rename
  writes) and EXIF/dimensions/thumbhash results are byte-equivalent in intent to
  today; no visible change to served images.
- **FR3** — A concurrency limit caps how many photos are processed at once.
  Work beyond the limit queues rather than running immediately, regardless of
  how many requests or files arrive.
- **FR4** — `sharp` is configured once at startup (cache off, bounded
  concurrency); the libuv thread pool size is set appropriately.
- **FR5** — The endpoint's request/response shape, status codes, and replace
  semantics are unchanged.

## Non-functional requirements

- **NFR1 — Resource safety:** peak memory stays bounded under concurrent bulk
  uploads; no unbounded growth with request count.
- **NFR2 — Performance:** measurably less CPU per photo (fewer decodes) and no
  regression in ingest latency for a single photo.
- **NFR3 — Concurrency:** the server stays responsive to read traffic during
  ingest; ingest work does not block the event loop.
- **NFR4 — Correctness:** existing ingest tests pass unchanged; derivatives and
  metadata remain valid.
- **NFR5 — Simplicity:** no new runtime services or heavy dependencies;
  changes stay in the existing ingest/derivatives modules.

## Out of scope / future

- Async ingest with `202` + status polling, if the iOS Shortcut ever times out
  on large bulk uploads.
