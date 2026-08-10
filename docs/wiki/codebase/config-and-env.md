# Configuration: env vars + hardcoded tunables

Everything env-driven flows through one module — `src/server/config.ts` —
which reads `process.env` **once at import time** and exports `config`
(typed) + `paths` (derived on-disk locations). Nothing else in the codebase
reads `process.env` directly. Local dev loads `.env` via `tsx
--env-file-if-exists`; the container/Quadlet path sets real process env (see
[build-and-deploy.md](build-and-deploy.md)).

`.env.example` is the canonical annotated template — copy to `.env` for
local dev, never commit real secrets.

## App-config env vars (`config.ts`, loadable from `.env`)

| Var | Default | Read at | Notes |
|---|---|---|---|
| `PORT` | `3000` | `config.port` | |
| `HOST` | `0.0.0.0` | `config.host` | |
| `DATA_DIR` | `data` (resolved to cwd) | `config.dataDir` / `paths.*` | Parent of `gallery.db`, `originals/`, `derivatives/` — see [database.md](database.md) |
| `ADMIN_KEY_ID` | `""` | `config.adminKeyId` | Public key id, sent as `X-Key-Id`. Empty ⇒ HMAC routes always 401 |
| `ADMIN_HMAC_SECRET` | `""` | `config.adminHmacSecret` | Shared secret — signs HMAC requests **and** the session cookie (see below). Empty ⇒ HMAC routes always 401 |
| `CONTACT_EMAIL` | `""` (trimmed) | `config.contactEmail` | Contact page |
| `CONTACT_GREETING` | `"Get in Touch"` | `config.contactGreeting` | Falls back when unset or empty after trim |
| `INGEST_CONCURRENCY` | `1` | `config.ingestConcurrency` | Photos decoded/encoded at once, process-wide. `posInt()`-parsed — non-integer or `<1` silently falls back to default |
| `SHARP_CONCURRENCY` | `min(2, cpu cores)` | `config.sharpConcurrency` | libvips threads per sharp op, applied via `sharp.concurrency()` in `app.ts:24` |
| `NODE_ENV` | — | `config.isProduction` | `"production"` ⇒ session cookie gets `secure: true` |

`INGEST_CONCURRENCY * SHARP_CONCURRENCY` should stay `<=` core count so
ingest never starves request serving (`.env.example` comment) — see
[ingest-pipeline.md](ingest-pipeline.md).

## Boot-time env vars (NOT app-config — must be real process env)

These are read by libuv/V8 **before** `config.ts` (or any app code) runs, so
they cannot come from a dotenv file the app loads at runtime — set them on
the start command or the container/Quadlet env instead:

| Var | Baked-in default (container) | Purpose |
|---|---|---|
| `UV_THREADPOOL_SIZE` | `4` | libuv pool size — sharp's decode/encode runs on it |
| `NODE_OPTIONS` | `--max-old-space-size=1024` | V8 heap cap, leaves headroom for libvips' off-heap memory |

`pnpm start` sets both inline (`package.json`); the `Containerfile` runtime
stage sets both as image `ENV`. See
[build-and-deploy.md](build-and-deploy.md) for where each is set and how to
override per-host via Quadlet `Environment=`.

## Hardcoded tunables (no env override)

Not env-configurable by design — change requires editing source:

| Constant | Value | File | Purpose |
|---|---|---|---|
| `SESSION_TTL_MS` | 2 days | `plugins/session.ts` | Admin session cookie lifetime; signed with `ADMIN_HMAC_SECRET` (same secret as HMAC auth, different purpose — see [admin-auth.md](admin-auth.md)) |
| `MAX_SKEW_MS` | 5 min | `plugins/hmac-auth.ts` | HMAC request replay window — `X-Timestamp` must be within this of server time |
| rate-limit `max` / `timeWindow` | 1000 req / 1 min | `plugins/rate-limit.ts` | Global abuse backstop, keyed on `CF-Connecting-IP` (falls back to socket IP). Deliberately loose — album views fire many asset requests. Authenticated admins bypass entirely via `allowList` |
| `MAX_UPLOAD_BYTES` | 60 MB | `services/multipart.ts` | Per-request buffered body / file-size cap for photo uploads; also busboy's default `files` limit of 50 |
| CSV import body limit | 16 MB | `routes/auth.ts:246` | Separate, larger `bodyLimit` override for CSV metadata import (large libraries) |

Per-route rate limits (e.g. `POST /admin/login`) layer stricter
`config.rateLimit` options on top of the global backstop — see the route
definitions in `routes/auth.ts`.

## Where things are consumed

```
.env / process env
      │
      ▼
config.ts  ──────────────► paths.{db,originals,derivatives}   (database.md)
      │
      ├─► app.ts            sharp.concurrency(config.sharpConcurrency)
      ├─► plugins/hmac-auth.ts   config.adminKeyId / adminHmacSecret
      ├─► plugins/session.ts     config.adminHmacSecret / isProduction
      ├─► services/ingest-limiter.ts   createLimiter(config.ingestConcurrency)
      └─► views (contact page)   config.contactEmail / contactGreeting
```

Related: [build-and-deploy.md](build-and-deploy.md) (Quadlet
`EnvironmentFile`, container-baked defaults),
[admin-auth.md](admin-auth.md) (how `ADMIN_HMAC_SECRET` backs two distinct
mechanisms), [ingest-pipeline.md](ingest-pipeline.md) (concurrency knobs in
context).
