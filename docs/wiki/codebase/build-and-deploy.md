# Build pipeline + container image deployment

## Local build — `pnpm build`

Three sub-steps, chained in `package.json`:

```
build:server → tsc -p tsconfig.json && node scripts/copy-assets.js   (src/server → dist/)
build:css    → tailwindcss -i src/client/css/app.css -o public/css/app.css --minify
build:js     → node scripts/esbuild.js   (src/client/ts/main.ts → public/js/app.js)
```

- `build:server` also runs `scripts/copy-assets.js` — copies non-`.ts` server
  assets (e.g. `db/schema.sql`) into `dist/` since `tsc` only emits compiled JS.
- `pnpm start` runs the compiled output directly:
  `UV_THREADPOOL_SIZE=4 node --max-old-space-size=1024 dist/server/server.js`
  — same two boot-time env knobs the container sets (see below), so local
  `pnpm start` and the container behave the same under load.
- `pnpm dev` runs all three watchers concurrently instead
  (`dev:server` via `tsx watch`, `dev:css` and `dev:js` with `--watch`).

See [client-bundling.md](client-bundling.md) for esbuild entry details and
[styling.md](styling.md) for the Tailwind setup.

## Container image — `Containerfile`

Multi-stage build, `node:24-slim` both stages:

1. **`build` stage** — installs `python3 make g++ ca-certificates` (native
   module toolchain for `better-sqlite3` + `sharp`), `corepack enable`,
   `pnpm install --frozen-lockfile` (deps copied in before source for layer
   caching), then `pnpm build && pnpm prune --prod`.
2. **`runtime` stage** — copies only `node_modules`, `dist`, `public`,
   `package.json` from the build stage (no source, no build toolchain). Runs
   as non-root `app` user (uid 10001). Declares `VOLUME ["/app/data"]`,
   `EXPOSE 3000`, `CMD ["node", "dist/server/server.js"]`.

Runtime-stage env (baked into the image, `Containerfile:24-33`):

| Var | Value | Purpose |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | |
| `DATA_DIR` | `/app/data` | db + originals/ + derivatives/ |
| `UV_THREADPOOL_SIZE` | `4` | libuv pool size — sharp runs on it; must be set before node starts |
| `NODE_OPTIONS` | `--max-old-space-size=1024` | V8 heap cap, leaves headroom for libvips off-heap memory |

Both are sized for a 2 vCPU / 2 GB container (see
`docs/projects/20260628_*`); override via Quadlet `Environment=` if the host
differs (see below).

`.containerignore` excludes `node_modules dist public/css public/js data
.git *.log .DS_Store .env .env.*` from the build context.

## `just` recipes (`justfile`)

```
just setup           # toolbox provision (if present) + pnpm install --frozen-lockfile + db:migrate
just build           # pnpm build
just dev              # pnpm dev
just dev-container    # single-arch local image, run against ./data with --env-file .env
just image [tag]      # scripts/build-container.sh <tag>  (default: latest)
just release <bump>   # scripts/release.sh <major|minor|patch>
```

`registry := "ghcr.io/wisnuprama/atelier-photo"`; `version` is read live from
`package.json` via `node -p`.

## Multi-arch build/push — `scripts/build-container.sh [TAG]`

Builds **linux/amd64** and **linux/arm64** separately with `podman build
--platform`, pushes each (`:TAG-amd64`, `:TAG-arm64`), then assembles and
pushes a manifest at `:TAG` from the *pushed registry images* (`docker://`
transport) rather than local storage — avoids Podman having to resolve
manifest entries locally. Requires QEMU/binfmt for cross-arch emulation and
`podman login ghcr.io -u <user> -p <PAT>` first. Default `TAG=latest`.

## Release flow — `scripts/release.sh <major|minor|patch>`

Guards: working tree must be clean, `podman` must be on `PATH`. Steps:
`pnpm version <bump> --no-git-tag-version` → changelog scaffold (commit range
anchored on the last `chore: release vX.Y.Z` commit reachable from HEAD, not
`git describe --tags`, since a rebase-merged release branch can leave the tag
non-ancestor of mainline) → commit + tag → build+push via
`build-container.sh`. Invoke as `just release patch` (etc).

## Deployment — Podman Quadlet (`podman/atelier-photo.container`)

Systemd-managed rootless container unit. Install to
`~/.config/containers/systemd/` (rootless) or
`/etc/containers/systemd/` (system), then `systemctl --user daemon-reload` +
`systemctl --user start atelier-photo`.

- `Image=ghcr.io/wisnuprama/atelier-photo:latest`, `PublishPort=3000:3000`.
- `Volume=atelier-photo-data:/app/data` — named volume, persists sqlite db +
  originals/derivatives.
- `EnvironmentFile=%h/.config/atelier-photo/atelier-photo.env` — admin
  ingestion secrets (`ADMIN_KEY_ID`, `ADMIN_HMAC_SECRET`), never committed.
- App-runtime knobs overridable per-host via `Environment=` (read by
  `config.ts`): `INGEST_CONCURRENCY`, `SHARP_CONCURRENCY`.
- Boot-time knobs (`UV_THREADPOOL_SIZE`, `NODE_OPTIONS`) are already baked
  into the image as defaults but can be overridden here too — comment notes
  they *must* be env (not app-loaded `.env`) since libuv/V8 read them before
  app code runs.
- `Restart=always`, `TimeoutStartSec=30`.

Related: [directory-structure.md](directory-structure.md) (where `dist/` and
`public/` come from), [client-bundling.md](client-bundling.md) (esbuild
entry), [styling.md](styling.md) (Tailwind compile step).
