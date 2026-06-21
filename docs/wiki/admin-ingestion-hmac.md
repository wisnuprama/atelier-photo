# Admin ingestion — multipart parsing & HMAC

## Why busboy instead of `@fastify/multipart`

The bootstrap plan listed `@fastify/multipart`, but it parses from `request.raw`,
which the HMAC hook must drain to sign the raw body — the two conflict. It was
replaced with **`busboy`**: the admin route buffers the body once (via a
content-type parser), and the *same bytes* feed both HMAC verification and
parsing. This matches the plan's "HMAC over raw body" contract correctly and
isn't mentioned in `CLAUDE.md`, so there's no doc conflict.

- Content-type parser (`multipart/form-data`, `parseAs: "buffer"`) buffers the body.
- `preValidation` hook verifies the HMAC over those exact bytes before the handler runs.
- The handler parses the buffered bytes with `busboy` to extract fields + files.

See `src/server/routes/admin.ts` and `src/server/plugins/hmac-auth.ts`.

## Why it conflicts (in detail)

The conflict is about **who consumes the request body — and a body stream can
only be consumed once.**

### The underlying constraint

An HTTP request body arrives as a Node `Readable` stream (`request.raw`, the
`IncomingMessage`). It is **single-use**: once something reads it to the end, the
bytes are gone — there is no rewind. Two things both need those bytes:

1. **HMAC verification** needs the *complete raw body* — the signature is
   `HMAC(secret, "${timestamp}." + rawBodyBytes)`. You cannot verify a signature
   over data you have not fully read.
2. **Multipart parsing** (busboy) needs to read the same body stream to pull out
   the fields and the file.

Both want to be the consumer, and there is only one read.

### Why Fastify's normal escape hatch doesn't help

Fastify has a mechanism for this: the `preParsing` hook. Its `payload` argument
is the body stream, and you may consume it and **return a replacement stream**
that the content-type parser reads instead. That is exactly how you would
buffer-for-HMAC and hand a fresh copy downstream.

The problem is what `@fastify/multipart` actually does:

- Its content-type parser (`setMultipart`) **ignores the payload entirely** — it
  just sets a flag:

  ```js
  function setMultipart (req, _payload, done) { req[kMultipart] = true; done() }
  ```

- The real reading happens later, lazily, when the route calls `request.parts()`
  → `handleMultipart`, which reads **`this.raw` directly** (the original
  `IncomingMessage`):

  ```js
  const request = this.raw
  const bb = busboy({ headers: request.headers, ... })
  request.pipe(bb)   // reads request.raw, NOT the preParsing payload
  ```

So when a `preParsing` hook drains the stream to compute the HMAC, it drains
`request.raw`. The replacement stream it returns is used by *Fastify's* parser
layer — but busboy never looks there. It goes straight back to `request.raw`,
now empty → **zero fields, zero files** (the `400 "missing albumId field"`
response, even though the HMAC passed).

In short: `preParsing`'s "consume + return a new stream" contract assumes the
parser reads the payload it is handed. `@fastify/multipart` breaks that
assumption by reading `request.raw` out-of-band, so the two cannot coexist.

### Why buffering resolves it

A content-type parser with `parseAs: "buffer"` reads the stream **once** into
memory and stores it as `request.body` (a `Buffer`). A `Buffer` is not
single-use — it can be read any number of times. So now:

- the `preValidation` hook reads `request.body` to verify the HMAC, and
- the handler reads the *same* `request.body` and feeds it to busboy
  (`Readable.from(buffer).pipe(bb)`).

One read of the network stream, two reads of the buffer — no contention, and the
HMAC is provably over the exact bytes that get parsed.

The trade-off is that the whole upload is held in memory before auth runs, so it
is capped with `bodyLimit` (60 MB) — fine for this personal, single-user ingest
path.

## Run locally

```sh
pnpm install && pnpm build && pnpm db:migrate && pnpm db:seed && pnpm dev
```

The `.env` is already in place for admin auth.

> Note: as of bootstrap, nothing was committed yet.
