# Plan: Smart Cover Photo Fallback on Deletion

## Context

When a photo is deleted, `deletePhoto()` currently does:
```sql
UPDATE albums SET cover_photo_id = NULL WHERE cover_photo_id = ?
```
This leaves an album with no cover even when other photos are available. The improvement: when the deleted photo is the album's cover, automatically promote the most recently *uploaded* photo in that album as the new cover. If no photos remain, fall back to NULL (existing behaviour).

---

## Approach

A single correlated subquery handles both cases in one statement inside the existing transaction:

```sql
UPDATE albums
SET cover_photo_id = (
  SELECT id FROM photos
  WHERE album_id = albums.id
    AND id != :photoId
  ORDER BY created_at DESC
  LIMIT 1
)
WHERE cover_photo_id = :photoId
```

- **Other photos exist** → subquery returns the most recently ingested photo's id → that becomes the new cover.  
- **No photos left** → subquery returns `NULL` → `cover_photo_id` is set to `NULL`.
- **Photo wasn't the cover** → `WHERE cover_photo_id = :photoId` matches nothing → no-op.

The sort key is `created_at DESC` (ingest time), which matches "last uploaded."

---

## File changed

| File | Change |
|------|--------|
| `src/server/services/photos.ts` | Replace the `UPDATE albums SET cover_photo_id = NULL` line inside `deletePhoto()`'s transaction with the correlated-subquery UPDATE above |

No other files need to change. The service function signature, the route, and the client JS are all unaffected.

---

## Unit Test

### Infrastructure note

Vitest is not yet installed. This plan includes the minimal setup needed to run the one new test file. Full infrastructure (coverage thresholds, all 17 modules) is tracked separately in `docs/projects/20260621_unit-test/`.

**New devDependencies:**
```
vitest
```

**New `vitest.config.ts`** (root):
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",  // required: better-sqlite3 native addon can't cross worker threads
    isolate: true,
    server: { deps: { external: ["better-sqlite3", /\.node$/] } },
  },
});
```

**`package.json` scripts to add:**
```json
"test": "vitest run",
"test:watch": "vitest"
```

**`tsconfig.json`** — add `"src/**/*.test.ts"` to `exclude` so `tsc` build ignores test files.

---

### New test file: `src/server/services/photos.test.ts`

Uses a real in-memory SQLite database (`:memory:`) so the correlated subquery is exercised for real — a mock DB cannot validate SQL logic. File I/O (`fs.rm`, `fs.mkdir`, `fs.writeFile`, `sharp`, `exifr`, `thumbhash`) is mocked to keep the test fast and hermetic.

**Setup pattern:**
```ts
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// Mock all I/O and config before any imports resolve
vi.mock("../config.js", () => ({
  config: { adminKeyId: "k", adminHmacSecret: "s", isProduction: false, dataDir: "/tmp/t" },
  paths: { db: ":memory:", originals: "/tmp/o", derivatives: "/tmp/d" },
}));
vi.mock("node:fs/promises");          // stubs mkdir, writeFile, rm
vi.mock("./derivatives.js");           // stubs generateDerivatives
vi.mock("./exif.js");                  // stubs extractExif
vi.mock("./thumbhash.js");             // stubs computeThumbHash
vi.mock("sharp");                      // stubs intrinsicDimensions path

import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { getDb, closeDb } from "../db/index.js";
import { deletePhoto, createAlbum, ingestPhoto } from "./photos.js";

// Point the singleton to a fresh in-memory DB per test file (forks isolation).
// Override getDb to return our controlled instance, or let migrate() run on :memory:.
```

Because `pool: "forks"` gives each test *file* a fresh process, the `getDb()` singleton is fresh per file. Pointing `paths.db` at `":memory:"` means `migrate()` (called on first `getDb()`) creates a clean schema.

**Test cases for `deletePhoto()`:**

```ts
describe("deletePhoto", () => {
  let albumId: string;

  beforeEach(() => {
    // create album + photos via the real service functions
    const album = createAlbum({ name: "Test" });
    albumId = album.id;  // need to expose or look up
  });

  afterEach(() => {
    closeDb();
  });

  it("throws 404 for unknown photoId", async () => {
    await expect(deletePhoto("no-such-id")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("sets cover to most recently uploaded photo when cover is deleted", async () => {
    // insert two photos directly into DB (bypass ingest pipeline)
    const db = getDb();
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p1', ?, 's1', 'a.jpg', 1, 1)`).run(albumId);
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p2', ?, 's2', 'b.jpg', 1, 1)`).run(albumId);
    db.prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto("p1");

    const row = db.prepare(`SELECT cover_photo_id FROM albums WHERE id = ?`).get(albumId) as { cover_photo_id: string };
    expect(row.cover_photo_id).toBe("p2");
  });

  it("sets cover to NULL when the last photo is deleted", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p1', ?, 's1', 'a.jpg', 1, 1)`).run(albumId);
    db.prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto("p1");

    const row = db.prepare(`SELECT cover_photo_id FROM albums WHERE id = ?`).get(albumId) as { cover_photo_id: string | null };
    expect(row.cover_photo_id).toBeNull();
  });

  it("leaves cover unchanged when a non-cover photo is deleted", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p1', ?, 's1', 'a.jpg', 1, 1)`).run(albumId);
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p2', ?, 's2', 'b.jpg', 1, 1)`).run(albumId);
    db.prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto("p2");

    const row = db.prepare(`SELECT cover_photo_id FROM albums WHERE id = ?`).get(albumId) as { cover_photo_id: string };
    expect(row.cover_photo_id).toBe("p1");
  });

  it("removes the photo row from the DB", async () => {
    const db = getDb();
    db.prepare(`INSERT INTO photos (id, album_id, slug, filename, width, height)
                VALUES ('p1', ?, 's1', 'a.jpg', 1, 1)`).run(albumId);

    await deletePhoto("p1");

    const row = db.prepare(`SELECT id FROM photos WHERE id = 'p1'`).get();
    expect(row).toBeUndefined();
  });
});
```

---

## Unit Test

### Infrastructure (if not yet installed)

Per `docs/projects/20260621_unit-test/plans/vast-dancing-forest.md`, the test runner is **Vitest**.
If it isn't set up yet, first add:

```
pnpm add -D vitest
```

And create `vitest.config.ts` and `tsconfig.test.json` as documented in that plan. Add `"test": "vitest run"` to `package.json` scripts.

### Test file: `src/server/services/photos.test.ts`

The SQL logic is best covered with a **real in-memory SQLite database** (no mocking) so the correlated subquery is actually exercised. Use `migrate()` to apply the schema, helpers to insert rows, and `closeDb()` in `afterEach`.

```ts
// Setup pattern
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// Point DATA_DIR to a temp dir so file cleanup paths don't error
vi.stubEnv("DATA_DIR", join(tmpdir(), "photo-test"));
// The real better-sqlite3 db — path set via env above
```

**Test cases for `deletePhoto()`:**

| # | Scenario | Assert |
|---|----------|--------|
| 1 | Photo doesn't exist | throws error with `statusCode === 404` |
| 2 | Delete a non-cover photo | `cover_photo_id` of album unchanged |
| 3 | Delete cover photo; 1 other photo remains | `cover_photo_id` set to that other photo's id |
| 4 | Delete cover photo; 2 other photos remain | `cover_photo_id` set to the **most recently created** photo (not the oldest) |
| 5 | Delete cover photo; no other photos in album | `cover_photo_id` set to `NULL` |
| 6 | Delete cover photo; a second album exists with its own cover | second album's `cover_photo_id` untouched |

Cases 3–6 also assert that `SELECT id FROM photos WHERE id = ?` returns no row (photo is gone from DB).

File cleanup (`fs.rm`) is fire-and-forget; mock it to avoid touching the filesystem in tests:
```ts
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
```

---

## Verification

1. `pnpm typecheck` — clean (no type changes involved).
2. Seed or upload 2+ photos to an album; set one as cover in the DB.
3. Delete that cover photo via long-press → confirm → verify the album now shows the most recently uploaded remaining photo as its cover (check `SELECT cover_photo_id FROM albums` in sqlite3, or reload the home page and confirm the album card thumbnail changed).
4. Delete all remaining photos one by one; on the last deletion, verify `cover_photo_id IS NULL`.
5. Delete a non-cover photo — verify the cover is unchanged.
