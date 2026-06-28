# Photo Gallery Web — User Guide

A personal, minimalist black‑and‑white photo gallery. These pages explain how to
browse the gallery, how to add photographs, and how to run and maintain the app.

## Contents

1. [Overview](./overview.md) — what the gallery is and how it's organized.
2. [Browsing the gallery](./browsing-the-gallery.md) — albums, the photo timeline,
   and the full‑screen viewer (keyboard, touch, photo info).
3. [Adding photos](./adding-photos.md) — the admin ingest workflow: creating
   albums, uploading from an iOS Shortcut or `curl`, and how replacing works.
   - [Uploading from iOS with Scriptable](./ios-shortcut-scriptable.md) — the
     concrete share-sheet recipe (ready-to-paste signing script).
4. [Admin sign-in](./admin-sign-in.md) — the browser admin session that unlocks
   owner-only controls.
5. [Deleting photos](./deleting-photos.md) — removing a photo from an album page.
6. [Running & maintenance](./running-and-maintenance.md) — commands, environment
   variables, where files live on disk, and resetting the database.

### Deployment

- [Self-hosting with Podman Quadlet](./self-hosting-podman-quadlet.md) — run the
  gallery as a systemd service with Podman Quadlet.
- [Publishing the image to ghcr.io](./publishing-image-to-ghcr.md) — build and
  push the container image to GitHub Container Registry for server pulls.

### Developer notes

- [Admin ingestion — multipart parsing & HMAC](./admin-ingestion-hmac.md) — why the
  ingest route buffers the body and uses `busboy` rather than `@fastify/multipart`.

## Quick orientation

- **Visitors** browse albums at `/` and open an album at `/albums/<slug>`.
- **You (the owner)** add photos by sending HMAC‑signed uploads to `/admin/photos`
  — typically from an iOS Shortcut. See [Adding photos](./adding-photos.md).
- **To remove a photo**, [sign in](./admin-sign-in.md) at `/admin/login` and
  [delete it](./deleting-photos.md) from the album page.
- Photos are the hero: the interface stays out of the way, everything is keyboard
  navigable, and images load blur‑up with no layout shift.
