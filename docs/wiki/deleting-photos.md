# Deleting photos

Removing a photo is done from the browser, not the ingest API: you
[sign in to an admin session](./admin-sign-in.md), which turns on delete controls
directly on the album pages. The photo ID is never something you have to look up —
the page already knows it.

> You must be **signed in** first. See [Admin sign-in](./admin-sign-in.md).

## Deleting a photo

Open any album (`/albums/<slug>`) while signed in. Each photograph becomes
deletable:

- **Desktop:** **right-click** a photo to open a small menu, then choose
  **Delete photo**.
- **Touch:** **long-press** a photo (~0.6 s) to open the same menu. (Dragging
  cancels it, so scrolling never triggers a delete.)

Choosing **Delete photo** shows a confirmation — *"Delete this photo? This cannot
be undone."* On confirm, the photo fades out and is removed from the page. The
viewer does **not** open when you long-press; that tap is suppressed.

Deletion happens through `DELETE /admin/photos/:photoId`, authorized by the
`admin_session` cookie (no HMAC header). It returns **204** on success, **401** if
your session is missing or expired, and **404** if the photo no longer exists.

## What gets removed

A delete is processed safely and atomically:

1. Any album whose **cover** points at the photo has its cover reference cleared
   (covers fall back automatically).
2. The photo row is deleted from the database in a single transaction.
3. The photo's files are removed from disk — both
   `data/originals/<photoId>/` and `data/derivatives/<photoId>/`.

File cleanup is best-effort: if a file can't be removed it's logged as a warning,
but the database delete still stands (so the photo is gone from the gallery and
won't reappear). There is **no undo** — re-add the photo through the ingest API if
you delete one by mistake.
