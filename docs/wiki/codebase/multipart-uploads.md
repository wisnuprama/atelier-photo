# Multipart / upload handling

**No `@fastify/multipart`.** `busboy ^1.6.0` is used directly, wrapped in a
shared service `src/server/services/multipart.ts`:

```ts
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024; // :6

export function parseMultipart(                    // :14
  headers: IncomingHttpHeaders,
  raw: Buffer,
  limits: { fileSize?: number; files?: number } = {}, // defaults: MAX_UPLOAD_BYTES / 50
): Promise<ParsedMultipart>
// ParsedMultipart = { fields: Record<string,string>; files: Array<{ filename: string; data: Buffer }> }
```

Consumers:

- **HMAC scope** (`routes/admin.ts`) — bulk-capable `POST /admin/photos`
  (default limits).
- **Session scope** (`routes/auth.ts:140`) — browser
  `POST /admin/photos/upload` with `{ files: 1 }` (one file per request; the
  client uploads through a small concurrent pool, max 3 in flight — see
  [album-detail-page.md](album-detail-page.md)).

Note busboy's `files` limit **silently drops** extra file parts rather than
erroring; the session route additionally 400s when `files.length !== 1`.

## Plugin-scope gotchas

- Content-type parsers and hooks are encapsulated per Fastify plugin scope:
  each of `adminRoutes` and `authRoutes` registers its **own** raw-buffer
  `multipart/form-data` parser (`admin.ts:40-46`, `auth.ts:66-73`), and the
  HMAC `preValidation` hook only exists in the admin scope (see
  [admin-auth.md](admin-auth.md)).
- Fastify's default `bodyLimit` is 1 MB — upload parsers pass an explicit
  `bodyLimit: MAX_UPLOAD_BYTES`.

Downstream processing of an uploaded buffer:
[ingest-pipeline.md](ingest-pipeline.md).
