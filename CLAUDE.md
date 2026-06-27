# Photo Gallery Web

Personal, minimalist black-and-white photo gallery. A professional-but-personal
"contemporary gallery building" for showcasing photographs.

## Documentation

- Requirements: `docs/projects/20260621_bootstrap/REQUIREMENTS.md`
- Design prototype: `docs/projects/20260621_bootstrap/DESIGN.html`

**Rule — plan & design docs:**

- When there is a new project, create a new folder under `docs/projects/`.
  Name it `YYYYMMDD_<short-kebab-name>` (creation date + a short slug), e.g.
  `docs/projects/20260621_fullscreen-viewer-swipe-fix/`.
- Each project's plan/design documents live in that project folder, with plans
  under a `plans/` subfolder, e.g.
  `docs/projects/{YYYYMMDD_name}/plans/{plan}.md`. When a new plan is approved,
  write it there; do not leave plan docs only in `~/.claude/plans`.

## Stack

- Node 24 LTS, **TypeScript 6**, **ESM** (`"type": "module"`).
- **Fastify** server with **SSR** (HTML rendered server-side via template-literal
  views); vanilla TS for client interactivity. No SPA framework.
- **better-sqlite3** for the database.
- **Tailwind v4** (compiled via `@tailwindcss/cli`, CSS-first `@theme`) — not the CDN.
- `lucide-static` for icons (inlined into SSR markup).
- `esbuild` bundles client TS → `public/js`.
- `sharp` + `exifr` + `thumbhash` for the ingest/derivative pipeline.

## Package manager

**pnpm only** — do not use npm or yarn.

## Dev environment

The project uses a **Fedora Toolbox** container for local development on supported
systems (Fedora / any host with `toolbox` installed).

- `make setup` — installs deps and runs DB migrations; auto-provisions the
  toolbox container (`atelier-photo`) when `toolbox` is detected on the host.
- `./scripts/setup-toolbox.sh` — provision only (idempotent; re-running is safe).
- `./scripts/setup-toolbox.sh --enter` — provision then drop into the container.
- `toolbox enter atelier-photo` — enter an already-provisioned container.

The script installs inside the container: `gcc/gcc-c++`, `make`, `python3`,
`vips-devel` (required by `sharp`), Node.js 24 (NodeSource RPM), and
pnpm 10.17.1 (via corepack).

## Common commands

- `pnpm dev` — watch server + Tailwind + esbuild.
- `pnpm build` — `tsc` (server → `dist`) + Tailwind compile + esbuild bundle.
- `pnpm start` — run `dist/server/server.js`.
- `pnpm typecheck` — `tsc --noEmit`.
- `pnpm lint` — **oxlint**. `pnpm fmt` — **oxfmt**.
- `pnpm db:migrate` / `pnpm db:seed`.

## Conventions

- ESM imports throughout; no CommonJS.
- Keep it lightweight: prefer web standards and plain CSS; avoid adding frameworks
  or heavy dependencies.
- The photos are the hero; the interface stays out of the way.
- Accessibility is required: keyboard navigable, visible focus, honor
  `prefers-reduced-motion`, meaningful `alt` text.
- Data, originals, and derivatives live under `data/` (mounted as a Podman volume);
  secrets (`ADMIN_KEY_ID`, `ADMIN_HMAC_SECRET`) come from env — never commit them.
- Container/runtime via **Podman** (Containerfile + named volume + quadlet).
