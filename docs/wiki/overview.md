# Overview

Photo Gallery Web is a personal gallery for showing photographs in a quiet,
contemporary‑gallery style. It is built to be lightweight and fast: the server
renders HTML directly (no single‑page‑app framework), and the photographs are
always the focus.

## How content is organized

- **Albums** group photographs by theme (for example *Coastlines* or *Portraits*).
  Each album has a readable **slug** used in its URL — `/albums/coastlines`.
- **Photos** belong to one album. Within the gallery each photo carries its title,
  an optional note (commentary), capture date, and camera settings (EXIF) when
  available.
- A built‑in **Discover** album is created automatically the first time you upload
  a photo without naming a target album.

## Identity: `id` vs. `slug`

Both albums and photos have two identifiers:

- **`id`** — a random, opaque, permanent identifier. It never changes, and it
  drives where files live on disk and the image URLs (`/media/<id>/...`).
- **`slug`** — a human‑readable name derived from the title or filename, used in
  readable page URLs (`/albums/<slug>`). Renaming re‑derives the slug without
  moving any files.

Because the `id` is stable, re‑uploading a photo (see
[Adding photos](./adding-photos.md)) keeps the same URLs and on‑disk location.

## How images are delivered

Every uploaded original is processed once into resized **derivatives** in three
formats — **AVIF**, **WebP**, and **JPEG** — at two sizes (a grid thumbnail and a
full timeline image). When a browser requests an image, the server automatically
serves the best format that browser accepts (AVIF where possible, falling back to
WebP, then JPEG). You don't have to do anything — there is a single image URL per
size and the negotiation is invisible.

While a full image is still downloading, a tiny **ThumbHash** placeholder shows a
blurred preview in exactly the right aspect ratio, so the page never jumps.
