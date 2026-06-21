# Plan: Dynamic Year Range for "Selected Work" Label

## Context

The albums page header currently shows a hardcoded "Selected Work · 2021—2026" label. The year range should reflect the actual oldest and most recent `taken_at` dates across all photos. Because this value rarely changes (only when new photos are ingested) and is read on every page load, it should be memoized in-process and invalidated only when `ingestPhoto()` writes to the DB.

---

## Implementation

### 1. Add `getPhotoYearRange()` to the photos service

**File:** `src/server/services/photos.ts`

Add a module-level cache variable and a new export:

```typescript
let yearRangeCache: { oldest: number; newest: number } | null = null;

export function getPhotoYearRange(): { oldest: number; newest: number } | null {
  if (yearRangeCache) return yearRangeCache;
  const row = getDb()
    .prepare<[], { oldest: string | null; newest: string | null }>(
      `SELECT MIN(taken_at) AS oldest, MAX(taken_at) AS newest FROM photos WHERE taken_at IS NOT NULL`,
    )
    .get();
  if (!row?.oldest || !row?.newest) return null;
  yearRangeCache = {
    oldest: new Date(row.oldest).getUTCFullYear(),
    newest: new Date(row.newest).getUTCFullYear(),
  };
  return yearRangeCache;
}
```

At the end of `ingestPhoto()` (after the DB upsert transaction), add:

```typescript
yearRangeCache = null;
```

This follows the same pattern as the icon SVG cache in `src/server/views/icons.ts` (module-level `Map`, lazy-init, simple invalidation).

---

### 2. Thread year range through the route

**File:** `src/server/routes/pages.ts`

```typescript
import { listAlbums, getPhotoYearRange } from "../services/photos.js";

// inside the GET / handler:
body: albumsPage(listAlbums(), getPhotoYearRange()),
```

---

### 3. Update `albumsPage()` to accept and render the range

**File:** `src/server/views/albums.ts`

Change signature:

```typescript
export function albumsPage(
  albums: AlbumWithCover[],
  yearRange: { oldest: number; newest: number } | null,
): string
```

Replace the hardcoded label:

```typescript
const yearLabel = yearRange
  ? yearRange.oldest === yearRange.newest
    ? `Selected Work · ${yearRange.oldest}`
    : `Selected Work · ${yearRange.oldest}—${yearRange.newest}`
  : "Selected Work";
```

Then in the template: `${yearLabel}` instead of the hardcoded string.

---

## Verification

1. `pnpm typecheck` — no TS errors.
2. `pnpm dev`, browse to `/` — label reflects actual photo dates.
3. Upload a photo with a `taken_at` outside the current range via `POST /admin/photos`; reload `/` — label updates to new range.
4. If no photos exist (empty DB), label shows "Selected Work" with no year suffix.
