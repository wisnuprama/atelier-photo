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

| Variable            | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `PORT`              | HTTP port (default `3000`).                               |
| `HOST`              | Bind address (default `0.0.0.0`).                         |
| `DATA_DIR`          | Root for the database, originals, and derivatives.        |
| `ADMIN_KEY_ID`      | Admin key id expected in the `X-Key-Id` header.           |
| `ADMIN_HMAC_SECRET` | Secret used to sign/verify admin requests.                |
| `NODE_ENV`          | Set to `production` in deployment.                         |

`ADMIN_KEY_ID` and `ADMIN_HMAC_SECRET` are **secrets** — provide them via the
environment (or a Podman secret), never commit them. Until both are set, the admin
ingest endpoints reject every request with **401**.

## Where files live

Everything persistent lives under `DATA_DIR` (the Podman volume in production):

```
data/
  gallery.db                         # SQLite database (+ -wal / -shm)
  originals/<photoId>/<filename>     # the uploaded original, untouched
  derivatives/<photoId>/<variant>.<ext>   # thumb|full × avif|webp|jpeg
```

Because paths are keyed on the photo's stable `id`, re‑uploading a photo overwrites
its originals and derivatives in place.

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
