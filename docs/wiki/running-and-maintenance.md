# Running & maintenance

This page is for whoever runs the gallery. The project uses **pnpm** — do not use
npm or yarn.

## Common commands

| Command            | What it does                                              |
| ------------------ | -------------------------------------------------------- |
| `pnpm dev`         | Watch mode: server + Tailwind + client bundle.           |
| `pnpm build`       | Compile the server, Tailwind CSS, and client JS.         |
| `pnpm start`       | Run the built server (`dist/server/server.js`).          |
| `pnpm db:migrate`  | Apply the database schema (idempotent; safe on boot).    |
| `pnpm db:seed`     | Replace all data with development seed albums/photos.     |
| `pnpm typecheck`   | `tsc --noEmit`.                                           |
| `pnpm lint`        | Run oxlint.                                               |
| `pnpm fmt`         | Format with oxfmt (`pnpm fmt:check` to verify only).     |

## Environment variables

| Variable             | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `PORT`               | HTTP port (default `3000`).                               |
| `HOST`               | Bind address (default `0.0.0.0`).                         |
| `DATA_DIR`           | Root for the database, originals, and derivatives.        |
| `ADMIN_KEY_ID`       | Admin key id expected in the `X-Key-Id` header.           |
| `ADMIN_HMAC_SECRET`  | Secret used to sign/verify admin requests.                |
| `NODE_ENV`           | Set to `production` in deployment.                         |
| `INGEST_CONCURRENCY` | Photos decoded/encoded at once, across all requests (default `1`). |
| `SHARP_CONCURRENCY`  | libvips threads per sharp operation (default: `min(2, cpu cores)`). |
| `UV_THREADPOOL_SIZE` | libuv pool size sharp runs on; **boot-time** (default `4` in the image). |
| `NODE_OPTIONS`       | Node launch flags, e.g. `--max-old-space-size=1024`; **boot-time**. |

`ADMIN_KEY_ID` and `ADMIN_HMAC_SECRET` are **secrets** — provide them via the
environment (or a Podman secret), never commit them. Until both are set, the admin
ingest endpoints reject every request with **401**.

### Ingest tuning

The ingest pipeline (decode → derivatives → write) is CPU- and memory-heavy. The
defaults above are sized for a **2 vCPU / 2 GB** container and are safe to leave
alone; tune only if you change the container's resources.

- `INGEST_CONCURRENCY` and `SHARP_CONCURRENCY` are read by the app at runtime, so
  they work from any env source (including a `.env` in dev). Keep
  `INGEST_CONCURRENCY × SHARP_CONCURRENCY ≤ core count` so ingest never fully
  starves request serving.
- `UV_THREADPOOL_SIZE` and `NODE_OPTIONS` are consumed by libuv/V8 **before** app
  code runs, so they cannot be applied from a `.env` the app loads — set them on
  the start command or the container env. They ship as defaults in the image
  (`Containerfile`) and can be overridden per host in the quadlet. See
  [Self-hosting with Podman Quadlet](./self-hosting-podman-quadlet.md).

`ADMIN_HMAC_SECRET` doubles as the credential for the browser **admin session**
(used to delete photos): it's the value you type at `/admin/login`, and it signs
the `admin_session` cookie. `NODE_ENV=production` additionally marks that cookie
`Secure`. See [Admin sign-in](./admin-sign-in.md).

## Where files live

Everything persistent lives under `DATA_DIR` (the Podman volume in production):

```
data/
  gallery.db                         # SQLite database (+ -wal / -shm)
  originals/<photoId>/<filename>     # the uploaded original, untouched
  derivatives/<photoId>/<variant>.<ext>   # thumb|medium|full × avif|webp|jpeg
```

Because paths are keyed on the photo's stable `id`, re‑uploading a photo overwrites
its originals and derivatives in place.

## Backfilling derivatives

Derivatives (`thumb`/`medium`/`full` × avif/webp/jpeg) are generated only at
ingest. After adding a size/format (e.g. `medium`), changing encoder quality,
or recovering lost files, regenerate them from the stored originals. The tool
compiles into `dist/` with the normal build, so it works inside the container:

```bash
podman exec -it -e INGEST_CONCURRENCY=4 <container> \
  node dist/server/tools/backfill-derivatives.js
```

- By default only photos **missing** any size × format file are regenerated —
  idempotent, safe to re-run. Pass `--force` to regenerate everything (e.g.
  after an encoder-quality change, where every file exists but is stale).
- Safe against a **live server**: the DB is only read (and closed before any
  image work starts), and each derivative is written atomically (temp +
  rename), so requests never see a partial file.
- **Concurrency** uses the same knobs as the server
  ([config-and-env.md](codebase/config-and-env.md)): `INGEST_CONCURRENCY`
  photos in flight at once (default `1`), each sharp op using
  `SHARP_CONCURRENCY` libvips threads. `podman exec -e` sets them for the
  tool's process only — the running server keeps its own values. Memory
  scales with `INGEST_CONCURRENCY` (each in-flight photo holds its original
  plus a raw decoded bitmap), so raise it as the container allows; keep
  `INGEST_CONCURRENCY × SHARP_CONCURRENCY` at or under the core count. The
  tool is a **separate process**, so its sharp work adds to the live
  server's — on small containers prefer a quiet window, or leave the default.
- The exec'd process inherits the image's baked-in `UV_THREADPOOL_SIZE=4` and
  `NODE_OPTIONS=--max-old-space-size=1024`; both can also be overridden with
  `-e` for a big backfill.
- Missing originals are reported per photo and the process exits non-zero.

In development: `pnpm derivatives:backfill` (add `-- --force` to regenerate
everything).

## Resetting the database

There is no data to preserve in development, so a reset is a delete + rebuild:

```bash
rm -f data/gallery.db data/gallery.db-wal data/gallery.db-shm
pnpm db:migrate   # recreate the schema (slug columns + unique indexes)
pnpm db:seed      # regenerate seed albums/photos
```

The **Discover** album is not seeded; it is created automatically the first time a
photo is uploaded without a target album.

## Container / deployment

The app runs under **Podman** (Containerfile + named volume + quadlet unit). The
named volume is mounted at the data directory so the database, originals, and
derivatives persist across restarts. Supply `ADMIN_KEY_ID` and `ADMIN_HMAC_SECRET`
to the container through the environment or a Podman secret.
