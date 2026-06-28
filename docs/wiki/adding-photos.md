# Adding photos

Photographs are added through the **admin ingest API**. There is no upload web
page; instead you send signed HTTP requests — usually from an **iOS Shortcut**, but
`curl` works too. Each upload is processed once: EXIF is read, derivatives in all
three formats are generated, a ThumbHash placeholder is computed, and the row is
saved.

## Authentication (HMAC)

Every `/admin/*` request must be signed. The server checks three headers:

| Header        | Value                                                             |
| ------------- | ---------------------------------------------------------------- |
| `X-Key-Id`    | Your key id (`ADMIN_KEY_ID`).                                     |
| `X-Timestamp` | Current time in **epoch milliseconds**.                          |
| `X-Signature` | Hex `HMAC-SHA256(ADMIN_HMAC_SECRET, "<X-Timestamp>." + <body>)`. |

The signature covers the timestamp, a literal `.`, and the **raw request body
bytes**. Requests whose timestamp is more than **±5 minutes** from the server clock
are rejected (replay protection). A missing, unknown, or mismatched signature
returns **401**.

> Credentials come from the `ADMIN_KEY_ID` and `ADMIN_HMAC_SECRET` environment
> variables and are never committed. See
> [Running & maintenance](./running-and-maintenance.md).

> **Uploading vs. deleting.** This HMAC header auth is for the **ingest** routes
> (`POST /admin/albums`, `POST /admin/photos`). Removing a photo uses a separate
> **browser session** instead — see [Admin sign-in](./admin-sign-in.md) and
> [Deleting photos](./deleting-photos.md).

## The workflow

1. **(Once per album)** Create a named album — or skip this and let uploads land in
   the auto‑created **Discover** album.
2. **(Optional)** List albums to pick a target slug.
3. **Upload** one or more photos to an album.

### 1. Create an album — `POST /admin/albums`

`multipart/form-data` fields:

| Field         | Required | Notes                                  |
| ------------- | -------- | -------------------------------------- |
| `name`        | yes      | Display name, e.g. `Night Walks`.      |
| `slug`        | no       | Explicit slug; derived from `name` otherwise. |
| `description` | no       | Short album description.               |

Returns **201** with the new album: `{ "id": "...", "slug": "night-walks" }`.

### 2. List albums — `GET /api/albums`

Returns `{ "albums": [ { "id", "slug", "name" }, ... ] }`. Use the **slug** as the
`album` value when uploading. (This endpoint is public — no signature needed.)

### 3. Upload photos — `POST /admin/photos`

`multipart/form-data`, bulk‑capable:

| Field        | Required | Notes                                                            |
| ------------ | -------- | ---------------------------------------------------------------- |
| `file`       | yes      | One or more image parts. The original filename is preserved.     |
| `album`      | no       | Target album **slug**. Defaults to `discover` (auto‑created).    |
| `title`      | no       | Title applied to the uploaded photo(s).                          |
| `commentary` | no       | A short note shown in the photo info panel.                      |

Returns **200**:

```json
{ "status": "ok", "created": 1, "replaced": 0,
  "photos": [ { "id": "...", "slug": "...", "status": "created" } ] }
```

## Replacing a photo

Uploading a file with the **same filename to the same album** replaces the existing
photo. On replace:

- The photo keeps its original **`id` and `slug`**, so its image URLs and on‑disk
  location are unchanged.
- Derivatives, dimensions, and the ThumbHash are **recomputed** from the new file.
- `title` and `commentary` are updated only if you send them; omit them to keep the
  existing values.

> To fix just the **title or commentary** without re-uploading the file, use the
> admin [photo table](./editing-photos.md) instead.

## Photos without EXIF

EXIF is optional. If a file has no embedded metadata (or it can't be read), the
upload still succeeds — the capture‑data fields are simply left blank, and the
photo sorts by upload order.

## Example: signing a request

Because the signature must cover the **exact** bytes that are sent, signing with a
plain `curl` command is awkward (curl builds the multipart body for you, so you
can't sign it beforehand). Byte‑exact signing is easiest in code — here is a
minimal Node version that builds the body, signs it, and sends it:

```js
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const ts = String(Date.now());
const boundary = "----galleryupload";
const file = readFileSync("./WALK_01.jpg");
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="album"\r\n\r\nnight-walks\r\n`),
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="WALK_01.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
  file, Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const sig = createHmac("sha256", process.env.ADMIN_HMAC_SECRET)
  .update(`${ts}.`).update(body).digest("hex");

await fetch("http://localhost:3000/admin/photos", {
  method: "POST",
  headers: {
    "content-type": `multipart/form-data; boundary=${boundary}`,
    "x-key-id": process.env.ADMIN_KEY_ID,
    "x-timestamp": ts,
    "x-signature": sig,
  },
  body,
});
```

## Dev helper scripts

For local development there are two `pnpm` scripts that build and sign the
requests for you (reading `ADMIN_KEY_ID` / `ADMIN_HMAC_SECRET` from `.env`):

```sh
# Upload one or more photos (bulk-capable)
pnpm dev:upload ./WALK_01.jpg
pnpm dev:upload ./a.jpg ./b.jpg --album night-walks --title "Night Walks"

# Create an album
pnpm dev:album "Night Walks" --slug night-walks --description "After dark."
```

Both accept `--url <base>` to target a non-default host (defaults to
`http://localhost:$PORT`). See `scripts/upload-photo.ts` and
`scripts/create-album.ts`.

## iOS Shortcut

The signature must cover the **exact** multipart bytes that are sent, and the
Shortcuts app has no HMAC (or hashing) action and builds the multipart body
internally — so it can't sign its own request. The working recipe does the
signing in the free **Scriptable** app, sharing photos to it from the share
sheet. The HMAC contract on the server is unchanged.

**→ Full step-by-step guide with the ready-to-paste script:
[Uploading from iOS with Scriptable](./ios-shortcut-scriptable.md).**

In short, for each selected photo the script:

1. Reads `ADMIN_KEY_ID` / `ADMIN_HMAC_SECRET` from the iOS Keychain.
2. Sets `X-Timestamp` to the current time in milliseconds.
3. Builds the `multipart/form-data` body by hand and computes `X-Signature` as
   the HMAC‑SHA256 over `"<timestamp>." + <body bytes>`.
4. Sends a `POST` to `/admin/photos` with the photo as the `file` part and an
   optional `album` slug.

To target a specific album, the script can call `GET /api/albums` and let you
pick a slug; otherwise omit `album` and the photo lands in **Discover**.
