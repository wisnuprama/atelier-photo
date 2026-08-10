# Creating albums & uploading from the browser

You can add photographs entirely from the browser — no signed API requests
needed. [Sign in to an admin session](./admin-sign-in.md) and two extra
controls appear on the gallery pages: **New album** on the album list, and
**Upload photos** on every album page.

The [HMAC ingest API](./adding-photos.md) still exists and is unchanged — the
iOS Shortcut and the dev scripts keep working. The browser flow is simply a
second door into the same pipeline: uploads are processed identically (EXIF,
derivatives, ThumbHash, replace-by-filename).

> You must be **signed in** first. See [Admin sign-in](./admin-sign-in.md).

## Creating an album

1. Go to the album list at **`/`**. While signed in, an admin strip appears
   above the grid.
2. Choose **New album**. A dialog asks for a **Name** (required) and an
   optional **Description**.
3. Choose **Create**. You're taken straight to the new (empty) album page,
   ready for its first upload.

The URL slug is derived from the name and de-duplicated automatically —
creating "Trip" twice yields `/albums/trip` and `/albums/trip-2`. A blank name
shows an inline error; **Cancel**, the backdrop, or <kbd>Esc</kbd> closes the
dialog.

## Uploading photos

1. Open any album (`/albums/<slug>`) while signed in and choose
   **Upload photos** in the admin strip.
2. **Drag photos onto the drop zone** — any number at once — or click it to
   open the file picker (multi-select works there too).
3. Watch the list: each file gets its own row with a live percentage while it
   uploads, ending in **Created ✓** (new photo) or **Replaced ✓** (a file with
   the same name already existed in this album — see
   [Replacing a photo](./adding-photos.md#replacing-a-photo)).
4. Choose **Done**. The page reloads and the new photographs appear in the
   timeline, placeholders and all.

Details worth knowing:

- **Accepted files:** JPEG, PNG, WebP, AVIF, TIFF, and GIF, up to **60 MB**
  each. Anything else (including HEIC) is marked *Unsupported type* in the
  list and never uploaded — on an iPhone this rarely comes up, since Safari
  converts HEIC to JPEG when you pick or share photos.
- Files upload **one at a time**; a failed file shows its error in its own row
  and doesn't stop the rest. You can drop more files while a batch is running.
- While uploads are in flight the dialog stays open — **Done** and
  <kbd>Esc</kbd> wait until the batch finishes.
- Uploads land in the album whose page you opened the dialog from. To upload
  into a different album, open that album first.

## When to use which method

| Situation | Use |
| --- | --- |
| At a computer, a handful of photos | **This page** — drag, drop, done. |
| From an iPhone share sheet | The [Scriptable shortcut](./ios-shortcut-scriptable.md). |
| Scripted/bulk ingestion, automation | The [HMAC API + dev scripts](./adding-photos.md). |
| Fixing a title or note, no re-upload | The [photo table](./editing-photos.md). |
