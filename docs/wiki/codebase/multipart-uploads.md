# Multipart / upload handling

**No `@fastify/multipart`.** `busboy ^1.6.0` is used directly, wrapped in a
private helper in `src/server/routes/admin.ts:24`:

```ts
function parseMultipart(headers: FastifyRequest["headers"], raw: Buffer): Promise<ParsedMultipart>
// ParsedMultipart = { fields: Record<string,string>; files: Array<{ filename: string; data: Buffer }> }
// busboy limits: { fileSize: MAX_BODY (60 MB), files: 50 }
```

It is **not exported** — a session-based upload route would need it extracted
(e.g. into `src/server/services/multipart.ts`).

## Plugin-scope gotchas

- Content-type parsers and hooks are encapsulated per Fastify plugin scope:
  registering a `multipart/form-data` parser inside `authRoutes` will **not**
  trigger the HMAC `preValidation` hook and won't affect `adminRoutes` (see
  [admin-auth.md](admin-auth.md)).
- Fastify's default `bodyLimit` is 1 MB — new upload routes need an explicit
  limit the way `admin.ts:80` sets one (`MAX_BODY` = 60 MB, `admin.ts:10`).

Downstream processing of an uploaded buffer:
[ingest-pipeline.md](ingest-pipeline.md).
