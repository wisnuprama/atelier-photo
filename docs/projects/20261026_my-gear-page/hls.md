# HLS — My Gear page

## Approach

Derive gear from photos at query time; store only the owner's active flag.

## Data model (`db/schema.sql`, additive)

```sql
CREATE TABLE IF NOT EXISTS gear (
  kind   TEXT NOT NULL CHECK (kind IN ('camera','lens')),
  name   TEXT NOT NULL,            -- exact EXIF string from photos
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (kind, name)
);
CREATE INDEX IF NOT EXISTS idx_photos_camera ON photos (camera_body);
CREATE INDEX IF NOT EXISTS idx_photos_lens   ON photos (lens);
```

- No row ⇒ active. A row is written only when the admin toggles
  (`INSERT ... ON CONFLICT(kind, name) DO UPDATE SET active = excluded.active`).
  No backfill and no ingest hook.
- `schema.sql` is applied on every boot with `IF NOT EXISTS`; this is safe for
  the production volume.
- Orphan rows (all photos deleted) are harmless; ignore.

## DAO (`services/photos.ts`, or a new `services/gear.ts` if the file is too big)

- `listGear(ctx): GearItem[]` where
  `GearItem = { kind, name, active, photoCount, firstYear, lastYear, sample: { id, width, height, thumbhash } }`.
  One `GROUP BY` per kind (UNION), `LEFT JOIN gear`, sample = latest photo by
  `taken_at DESC, created_at DESC` (correlated subquery, mirroring `COVER_JOIN`).
- `setGearActive(ctx, kind, name, active)`; validate `kind`, non-empty `name`
  that exists in photos (404-tagged Error otherwise).

## Routes

- `GET /gear` in `routes/pages.ts`, `activeNav: "gear"`, passes `isAdmin`.
- `POST /admin/gear/active` in `routes/auth.ts` (session scope): JSON
  `{ kind, name, active }` → 204. Body (not URL) carries the name because EXIF
  strings contain spaces and `|`. Guard with `getAdminSession`.

## View and client

- `views/gear.ts`: `gearPage(items, isAdmin)`. Sections Active/Inactive, each
  with Cameras and Lenses. Cards reuse thumb + thumbhash markup and the
  `data-thumbhash` / `photo-img` lazy-load conventions from `albums.ts`.
  `esc()` every string.
- Admin checkbox: a real `<input type="checkbox">` with a label, `data-gear-kind`,
  `data-gear-name`. New `client/ts/gear.ts` (`initGear()`, registered in
  `main.ts`): POST on change, then move the card between sections (or reload),
  roll back + `alert()` on failure. Keep pure helpers separate from DOM wiring.
- Navbar (`views/layout.ts`): add `{ href: "/gear", label: "Gear", key: "gear" }`
  and extend the `activeNav` union.
- Card link target: `/search?camera=<name>` or `/search?lens=<name>` built with
  `URLSearchParams` (see `gear-search`). Ship the links with the search project
  or behind it; coordinate order.

## Risks

- EXIF strings are inconsistent (`FE 24-70mm F2.8 GM II` vs
  `17mm F4 DG DN | Contemporary 023`); same physical item can appear twice.
  Accepted for v1; alias/merge and display names are a future project.
- Photos without EXIF (PNG/WebP/GIF) and adapted lenses never appear.
- Check production strings before finalising copy and layout; the local DB has
  only 3 photos.
- Public page reads on each request; negligible at this scale. No caching needed.

## Testing

- DAO: grouping, default-active, toggle upsert, year range, sample photo, null
  exclusion.
- Route: 401 gate, validation, 204 (auth test harness).
- View: sections split, admin checkbox only for admin, XSS escaping of names.
- Layout: nav link and `aria-current`.

## Docs to update

New wiki page `docs/wiki/codebase/gear-page.md`; update `database.md`,
`directory-structure.md`, `admin-auth.md`, wiki `README.md` index.
