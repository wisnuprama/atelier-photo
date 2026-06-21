# Atelier - Photo Gallery

A personal, minimalist black-and-white photo gallery. A quiet, contemporary-gallery-style showcase for photographs — no SPA framework, no build complexity, just fast server-rendered pages where the photos are always the first class.

## Features

- **Albums & timeline** — group photos by theme; browse in a single-column timeline sorted by capture date.
- **Full-screen viewer** — keyboard (`←`/`→`/`Esc`), swipe on mobile, photo info panel with EXIF data.
- **Automatic image derivatives** — every upload is processed once into AVIF, WebP, and JPEG at two sizes; the server negotiates the best format per browser.
- **ThumbHash placeholders** — blurred previews in the exact aspect ratio while the full image loads, no layout shift.
- **HMAC-signed admin API** — upload from an iOS Shortcut or `curl`; no web upload UI to maintain.
- **Accessible** — keyboard navigable, visible focus rings, `prefers-reduced-motion` respected, meaningful `alt` text.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node 24, TypeScript 6, ESM |
| Server | Fastify + SSR (template-literal views) |
| Client | Vanilla TypeScript, no SPA framework |
| Styling | Tailwind v4 (CSS-first `@theme`) |
| Database | SQLite via better-sqlite3 |
| Images | sharp + exifr + thumbhash |
| Icons | lucide-static (inlined into SSR markup) |
| Container | Podman (Containerfile + named volume + quadlet) |

## Getting started

### Prerequisites

- Node 24+
- pnpm (`corepack enable`)

### Local development

```sh
# 1. Install dependencies
pnpm install

# 2. Copy the example env file and fill in values
cp .env.example .env

# 3. Create the database schema
pnpm db:migrate

# 4. (Optional) Seed with development data
pnpm db:seed

# 5. Start the dev server (watch mode: server + Tailwind + esbuild)
pnpm dev
```

Open `http://localhost:3000`.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` | Root for the database, originals, and derivatives |
| `ADMIN_KEY_ID` | — | Public key identifier sent as `X-Key-Id` |
| `ADMIN_HMAC_SECRET` | — | Shared secret for signing admin requests |
| `NODE_ENV` | — | Set to `production` in deployment |

`ADMIN_KEY_ID` and `ADMIN_HMAC_SECRET` are secrets — provide them via the environment or a Podman secret; never commit them.

## Adding photos

Photos are uploaded through the admin ingest API using HMAC-signed requests. There is no web upload UI.

### Create an album

```sh
pnpm dev:album "Night Walks" --slug night-walks --description "After dark."
```

Or send a signed `POST /admin/albums` with `multipart/form-data` fields: `name`, `slug` (optional), `description` (optional).

### Upload photos

```sh
# Upload one photo
pnpm dev:upload ./WALK_01.jpg

# Upload to a specific album with metadata
pnpm dev:upload ./a.jpg ./b.jpg --album night-walks --title "Night Walks"
```

Or send a signed `POST /admin/photos` with `multipart/form-data`: `file` (one or more), `album` (slug, defaults to `discover`), `title`, `commentary`.

Uploading the same filename to the same album **replaces** the existing photo in place — the `id`, slug, and image URLs stay the same.

### HMAC authentication

Every `/admin/*` request requires three headers:

| Header | Value |
|---|---|
| `X-Key-Id` | Your `ADMIN_KEY_ID` |
| `X-Timestamp` | Current time in epoch milliseconds |
| `X-Signature` | Hex `HMAC-SHA256(ADMIN_HMAC_SECRET, "<timestamp>." + <body bytes>)` |

Requests whose timestamp is more than ±5 minutes from the server clock are rejected (replay protection).

## Common commands

| Command | Description |
|---|---|
| `pnpm dev` | Watch mode: server + Tailwind + esbuild |
| `pnpm build` | Compile server (tsc), Tailwind CSS, and client JS |
| `pnpm start` | Run the built server (`dist/server/server.js`) |
| `pnpm db:migrate` | Apply the database schema (idempotent) |
| `pnpm db:seed` | Replace all data with development seed data |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | Run oxlint |
| `pnpm fmt` | Format with oxfmt |

## Container deployment

Build and run with Podman:

```sh
podman build -t atelier-photo .
podman run -d \
  -p 3000:3000 \
  -v atelier-photo-data:/app/data \
  -e ADMIN_KEY_ID=your-key-id \
  -e ADMIN_HMAC_SECRET=your-secret \
  atelier-photo
```

A quadlet unit file is provided in `podman/atelier-photo.container` for systemd-managed deployments. See [Self-hosting with Podman Quadlet](docs/wiki/self-hosting-podman-quadlet.md) for the full guide.

## Data layout

Everything persistent lives under `DATA_DIR`:

```
data/
  gallery.db                              # SQLite database
  originals/<photoId>/<filename>          # uploaded originals, untouched
  derivatives/<photoId>/<variant>.<ext>   # thumb|full × avif|webp|jpeg
```

## License

Copyright © 2026 Wisnu Pramadhitya Ramadhan. All rights reserved.
