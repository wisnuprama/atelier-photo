import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: { adminKeyId: "k", adminHmacSecret: "s", isProduction: false, dataDir: "/tmp/t" },
  paths: { db: ":memory:", originals: "/tmp/t/originals", derivatives: "/tmp/t/derivatives" },
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./derivatives.js", () => ({ generateDerivatives: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./exif.js", () => ({
  extractExif: vi.fn().mockResolvedValue({
    takenAt: null,
    cameraBody: null,
    lens: null,
    focalLength: null,
    aperture: null,
    shutter: null,
    iso: null,
  }),
}));
vi.mock("./thumbhash.js", () => ({ computeThumbHash: vi.fn().mockResolvedValue(null) }));
vi.mock("sharp", () => ({
  default: vi.fn(() => ({
    metadata: vi.fn().mockResolvedValue({ width: 10, height: 10 }),
  })),
}));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import {
  createAlbum,
  deletePhoto,
  ensureAlbum,
  getAlbum,
  ingestPhoto,
  listAlbums,
  listAllPhotos,
  normalizePhotoFields,
  resetAlbumCover,
  setAlbumCover,
  updatePhoto,
} from "./photos.js";

describe("deletePhoto", () => {
  let albumId: string;

  beforeEach(() => {
    closeDb(); // reset singleton → next getDb() opens a fresh :memory: DB
    migrate();
    const album = createAlbum(consoleCtx, { name: "Test Album" });
    albumId = album.id;
  });

  afterEach(() => {
    closeDb();
  });

  function insertPhoto(id: string, slug: string, filename: string, createdAt?: string): void {
    const db = getDb();
    const ts = createdAt ?? new Date().toISOString();
    db.prepare(
      `INSERT INTO photos (id, album_id, slug, filename, width, height, created_at)
       VALUES (?, ?, ?, ?, 10, 10, ?)`,
    ).run(id, albumId, slug, filename, ts);
  }

  function getCoverPhotoId(): string | null {
    const row = getDb()
      .prepare<[string], { cover_photo_id: string | null }>(
        `SELECT cover_photo_id FROM albums WHERE id = ?`,
      )
      .get(albumId);
    return row?.cover_photo_id ?? null;
  }

  it("throws 404 for an unknown photoId", async () => {
    await expect(deletePhoto(consoleCtx, "does-not-exist")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("removes the photo row from the database", async () => {
    insertPhoto("p1", "s1", "a.jpg");
    await deletePhoto(consoleCtx, "p1");
    const row = getDb().prepare(`SELECT id FROM photos WHERE id = 'p1'`).get();
    expect(row).toBeUndefined();
  });

  it("sets cover to most recently uploaded remaining photo when cover is deleted", async () => {
    // p1 uploaded first, p2 uploaded after
    insertPhoto("p1", "s1", "a.jpg", "2025-01-01T00:00:00.000Z");
    insertPhoto("p2", "s2", "b.jpg", "2025-06-01T00:00:00.000Z");
    getDb().prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto(consoleCtx, "p1");

    expect(getCoverPhotoId()).toBe("p2");
  });

  it("sets cover to NULL when the last photo is deleted", async () => {
    insertPhoto("p1", "s1", "a.jpg");
    getDb().prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto(consoleCtx, "p1");

    expect(getCoverPhotoId()).toBeNull();
  });

  it("leaves cover unchanged when a non-cover photo is deleted", async () => {
    insertPhoto("p1", "s1", "a.jpg");
    insertPhoto("p2", "s2", "b.jpg");
    getDb().prepare(`UPDATE albums SET cover_photo_id = 'p1' WHERE id = ?`).run(albumId);

    await deletePhoto(consoleCtx, "p2");

    expect(getCoverPhotoId()).toBe("p1");
  });

  it("sets cover to NULL when cover is deleted and album had no explicit cover (cover_photo_id was already NULL)", async () => {
    insertPhoto("p1", "s1", "a.jpg");
    // cover_photo_id is NULL (default) — deleting p1 should leave it NULL

    await deletePhoto(consoleCtx, "p1");

    expect(getCoverPhotoId()).toBeNull();
  });
});

describe("ingestPhoto filename sanitization", () => {
  beforeEach(() => {
    closeDb();
    migrate();
  });

  afterEach(() => {
    closeDb();
  });

  it("rejects a filename containing path components", async () => {
    await expect(
      ingestPhoto(consoleCtx, { filename: "../escape/evil.jpg", data: Buffer.from("x") }),
    ).rejects.toThrow(/path components/);
  });

  it("ingests a clean filename successfully", async () => {
    const result = await ingestPhoto(consoleCtx, { filename: "photo.jpg", data: Buffer.from("x") });
    expect(result.status).toBe("created");
  });
});

describe("normalizePhotoFields", () => {
  it("trims the title", () => {
    expect(normalizePhotoFields({ title: "  Hello  " })).toEqual({ title: "Hello" });
  });

  it("throws 400 for an empty/whitespace title", () => {
    expect(() => normalizePhotoFields({ title: "   " })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => normalizePhotoFields({ title: "" })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => normalizePhotoFields({ title: null })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("trims commentary and maps empty to null", () => {
    expect(normalizePhotoFields({ commentary: "  note  " })).toEqual({ commentary: "note" });
    expect(normalizePhotoFields({ commentary: "   " })).toEqual({ commentary: null });
    expect(normalizePhotoFields({ commentary: null })).toEqual({ commentary: null });
  });

  it("leaves absent keys untouched (partial semantics)", () => {
    expect(normalizePhotoFields({})).toEqual({});
    expect(normalizePhotoFields({ title: "T" })).toEqual({ title: "T" });
    expect("commentary" in normalizePhotoFields({ title: "T" })).toBe(false);
  });
});

describe("updatePhoto + listAllPhotos", () => {
  let albumId: string;
  let albumSlug: string;

  beforeEach(() => {
    closeDb();
    migrate();
    const album = createAlbum(consoleCtx, { name: "Test Album" });
    albumId = album.id;
    albumSlug = album.slug;
  });

  afterEach(() => {
    closeDb();
  });

  function insertPhoto(
    id: string,
    opts: { title?: string | null; commentary?: string | null; createdAt?: string } = {},
  ): void {
    const ts = opts.createdAt ?? new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO photos (id, album_id, slug, filename, title, commentary, width, height, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 10, 10, ?)`,
      )
      .run(id, albumId, id, `${id}.jpg`, opts.title ?? null, opts.commentary ?? null, ts);
  }

  it("updates the title only, leaving commentary unchanged", () => {
    insertPhoto("p1", { title: "Old", commentary: "Keep" });
    const updated = updatePhoto(consoleCtx, "p1", { title: "  New  " });
    expect(updated.title).toBe("New");
    expect(updated.commentary).toBe("Keep");
  });

  it("updates commentary only, leaving title unchanged", () => {
    insertPhoto("p1", { title: "Keep", commentary: "Old" });
    const updated = updatePhoto(consoleCtx, "p1", { commentary: "  New note  " });
    expect(updated.title).toBe("Keep");
    expect(updated.commentary).toBe("New note");
  });

  it("updates both fields and stores empty commentary as null", () => {
    insertPhoto("p1", { title: "Old", commentary: "Old" });
    const updated = updatePhoto(consoleCtx, "p1", { title: "T", commentary: "   " });
    expect(updated.title).toBe("T");
    expect(updated.commentary).toBeNull();
  });

  it("throws 400 for an empty title", () => {
    insertPhoto("p1", { title: "Old" });
    expect(() => updatePhoto(consoleCtx, "p1", { title: "  " })).toThrowError(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it("throws 404 for an unknown id", () => {
    expect(() => updatePhoto(consoleCtx, "nope", { title: "T" })).toThrowError(
      expect.objectContaining({ statusCode: 404 }),
    );
  });

  it("listAllPhotos returns [] for an empty DB", () => {
    expect(listAllPhotos(consoleCtx)).toEqual([]);
  });

  it("listAllPhotos returns one row per photo with album slug/name, newest first", () => {
    insertPhoto("p1", { title: "First", createdAt: "2025-01-01T00:00:00.000Z" });
    insertPhoto("p2", { title: "Second", createdAt: "2025-06-01T00:00:00.000Z" });

    const rows = listAllPhotos(consoleCtx);
    expect(rows.map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(rows[0]).toMatchObject({
      id: "p2",
      albumSlug,
      albumName: "Test Album",
      title: "Second",
      // No pin and equal (NULL) taken_at → latest upload is the automatic cover.
      coverState: "auto",
    });
    expect(rows[1]?.coverState).toBeNull();
  });
});

/** Insert a photo with explicit taken_at/created_at (cover tests). */
function insertCoverPhoto(
  id: string,
  albumId: string,
  takenAt: string | null,
  createdAt = "2025-01-01T00:00:00.000Z",
): void {
  getDb()
    .prepare(
      `INSERT INTO photos (id, album_id, slug, filename, taken_at, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, 10, 10, ?)`,
    )
    .run(id, albumId, id, `${id}.jpg`, takenAt, createdAt);
}

function coverColumn(albumId: string): string | null {
  const row = getDb()
    .prepare<[string], { cover_photo_id: string | null }>(
      `SELECT cover_photo_id FROM albums WHERE id = ?`,
    )
    .get(albumId);
  return row?.cover_photo_id ?? null;
}

function coverStates(): Record<string, string | null> {
  return Object.fromEntries(listAllPhotos(consoleCtx).map((r) => [r.id, r.coverState]));
}

describe("setAlbumCover / resetAlbumCover", () => {
  let albumA: string;
  let albumB: string;

  beforeEach(() => {
    closeDb();
    migrate();
    albumA = createAlbum(consoleCtx, { name: "Album A" }).id;
    albumB = createAlbum(consoleCtx, { name: "Album B" }).id;
  });

  afterEach(() => {
    closeDb();
  });

  it("setAlbumCover writes cover_photo_id and returns the pinned result", () => {
    insertCoverPhoto("p1", albumA, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("p2", albumA, "2025-01-01T00:00:00.000Z");
    expect(setAlbumCover(consoleCtx, "p1")).toEqual({
      albumId: albumA,
      coverPhotoId: "p1",
      pinned: true,
    });
    expect(coverColumn(albumA)).toBe("p1");
  });

  it("overwrites an earlier pin", () => {
    insertCoverPhoto("p1", albumA, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("p2", albumA, "2025-01-01T00:00:00.000Z");
    setAlbumCover(consoleCtx, "p1");
    setAlbumCover(consoleCtx, "p2");
    expect(coverColumn(albumA)).toBe("p2");
  });

  it("the / read path (getAlbum) uses the pin over a later-taken photo", () => {
    insertCoverPhoto("old", albumA, "2020-01-01T00:00:00.000Z");
    insertCoverPhoto("new", albumA, "2025-01-01T00:00:00.000Z");
    expect(getAlbum(consoleCtx, albumA)?.cover?.id).toBe("new");
    setAlbumCover(consoleCtx, "old");
    expect(getAlbum(consoleCtx, albumA)?.cover?.id).toBe("old");
  });

  it("throws 404 for an unknown photo and leaves the album unchanged", () => {
    insertCoverPhoto("p1", albumA, null);
    setAlbumCover(consoleCtx, "p1");
    expect(() => setAlbumCover(consoleCtx, "nope")).toThrowError(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(() => resetAlbumCover(consoleCtx, "nope")).toThrowError(
      expect.objectContaining({ statusCode: 404 }),
    );
    expect(coverColumn(albumA)).toBe("p1");
  });

  it("only changes the album the photo belongs to (R4)", () => {
    insertCoverPhoto("a1", albumA, null);
    insertCoverPhoto("b1", albumB, null);
    setAlbumCover(consoleCtx, "a1");
    const result = setAlbumCover(consoleCtx, "b1");
    expect(result.albumId).toBe(albumB);
    expect(coverColumn(albumB)).toBe("b1");
    expect(coverColumn(albumA)).toBe("a1");
  });

  it("resetAlbumCover clears the pin and reports the automatic cover", () => {
    insertCoverPhoto("p1", albumA, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("p2", albumA, "2025-01-01T00:00:00.000Z");
    setAlbumCover(consoleCtx, "p1");
    expect(resetAlbumCover(consoleCtx, "p1")).toEqual({
      albumId: albumA,
      coverPhotoId: "p2",
      pinned: false,
    });
    expect(coverColumn(albumA)).toBeNull();
  });

  it("resetAlbumCover is idempotent on an automatic album", () => {
    insertCoverPhoto("p1", albumA, "2024-01-01T00:00:00.000Z");
    const first = resetAlbumCover(consoleCtx, "p1");
    expect(resetAlbumCover(consoleCtx, "p1")).toEqual(first);
    expect(first).toEqual({ albumId: albumA, coverPhotoId: "p1", pinned: false });
  });

  it("deleting a pinned cover still promotes the latest upload and pins it (R8)", async () => {
    insertCoverPhoto("p1", albumA, "2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z");
    // p2 is the latest upload but the oldest by taken_at.
    insertCoverPhoto("p2", albumA, "2020-01-01T00:00:00.000Z", "2025-06-01T00:00:00.000Z");
    insertCoverPhoto("p3", albumA, "2024-01-01T00:00:00.000Z", "2025-03-01T00:00:00.000Z");
    setAlbumCover(consoleCtx, "p1");
    await deletePhoto(consoleCtx, "p1");
    expect(coverColumn(albumA)).toBe("p2");
  });

  it("listAllPhotos marks the pinned row only", () => {
    insertCoverPhoto("p1", albumA, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("p2", albumA, "2025-01-01T00:00:00.000Z");
    setAlbumCover(consoleCtx, "p1");
    expect(coverStates()).toEqual({ p1: "pinned", p2: null });
  });

  it("listAllPhotos marks the latest-taken row as auto when nothing is pinned", () => {
    insertCoverPhoto("p1", albumA, "2025-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z");
    insertCoverPhoto("p2", albumA, "2024-01-01T00:00:00.000Z", "2025-06-01T00:00:00.000Z");
    expect(coverStates()).toEqual({ p1: "auto", p2: null });
  });

  it("listAllPhotos marks each album independently; empty albums add no rows", () => {
    createAlbum(consoleCtx, { name: "Empty" });
    insertCoverPhoto("a1", albumA, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("a2", albumA, "2025-01-01T00:00:00.000Z");
    insertCoverPhoto("b1", albumB, "2024-01-01T00:00:00.000Z");
    insertCoverPhoto("b2", albumB, "2025-01-01T00:00:00.000Z");
    setAlbumCover(consoleCtx, "b1");
    expect(coverStates()).toEqual({ a1: null, a2: "auto", b1: "pinned", b2: null });
  });

  it("listAllPhotos and getAlbum agree on the auto cover when taken_at ties", () => {
    const t = "2025-01-01T00:00:00.000Z";
    insertCoverPhoto("y", albumA, t, "2025-02-01T00:00:00.000Z");
    insertCoverPhoto("x", albumA, t, "2025-02-01T00:00:00.000Z");
    insertCoverPhoto("z", albumA, t, "2025-01-01T00:00:00.000Z");
    const cover = getAlbum(consoleCtx, albumA)?.cover?.id;
    // Equal taken_at and created_at → lowest id wins.
    expect(cover).toBe("x");
    const auto = listAllPhotos(consoleCtx).filter((r) => r.coverState === "auto");
    expect(auto.map((r) => r.id)).toEqual([cover]);
  });
});

// Use the datetime('now') format (YYYY-MM-DD HH:MM:SS), not toISOString():
// 'T' sorts after ' ', so mixed formats would sort wrongly.
function setAlbumCreatedAt(id: string, ts: string): void {
  getDb().prepare(`UPDATE albums SET created_at = ? WHERE id = ?`).run(ts, id);
}
const albumSlugs = () => listAlbums(consoleCtx).map((a) => a.slug);

describe("listAlbums ordering", () => {
  beforeEach(() => {
    closeDb();
    migrate();
  });

  afterEach(() => {
    closeDb();
  });

  it("pins Discover first, then orders newest first", () => {
    const discoverId = ensureAlbum(consoleCtx, "discover", "Discover");
    setAlbumCreatedAt(discoverId, "2020-01-01 00:00:00");
    const a = createAlbum(consoleCtx, { name: "A" });
    setAlbumCreatedAt(a.id, "2024-01-01 00:00:00");
    const b = createAlbum(consoleCtx, { name: "B" });
    setAlbumCreatedAt(b.id, "2025-01-01 00:00:00");

    expect(albumSlugs()).toEqual(["discover", "b", "a"]);
  });

  it("puts the later insert first when created_at is the same second", () => {
    const a = createAlbum(consoleCtx, { name: "A" });
    const b = createAlbum(consoleCtx, { name: "B" });
    setAlbumCreatedAt(a.id, "2025-06-01 12:00:00");
    setAlbumCreatedAt(b.id, "2025-06-01 12:00:00");

    expect(albumSlugs()).toEqual(["b", "a"]);
  });

  it("orders newest first when there is no Discover album", () => {
    const a = createAlbum(consoleCtx, { name: "A" });
    setAlbumCreatedAt(a.id, "2025-01-01 00:00:00");
    const b = createAlbum(consoleCtx, { name: "B" });
    setAlbumCreatedAt(b.id, "2023-01-01 00:00:00");
    const c = createAlbum(consoleCtx, { name: "C" });
    setAlbumCreatedAt(c.id, "2024-01-01 00:00:00");

    expect(albumSlugs()).toEqual(["a", "c", "b"]);
  });

  it("ignores position for order but still stores it", () => {
    const a = createAlbum(consoleCtx, { name: "A" });
    setAlbumCreatedAt(a.id, "2024-01-01 00:00:00");
    const b = createAlbum(consoleCtx, { name: "B" });
    setAlbumCreatedAt(b.id, "2025-01-01 00:00:00");

    const positions = getDb()
      .prepare<[], { slug: string; position: number }>(
        `SELECT slug, position FROM albums ORDER BY position ASC`,
      )
      .all();
    expect(positions).toEqual([
      { slug: "a", position: 0 },
      { slug: "b", position: 1 },
    ]);
    // Position order would be a, b; created_at order puts b first.
    expect(albumSlugs()).toEqual(["b", "a"]);
  });

  it("pins a Discover album made with createAlbum", () => {
    const discover = createAlbum(consoleCtx, { name: "Discover" });
    expect(discover.slug).toBe("discover");
    setAlbumCreatedAt(discover.id, "2020-01-01 00:00:00");
    const a = createAlbum(consoleCtx, { name: "A" });
    setAlbumCreatedAt(a.id, "2025-01-01 00:00:00");

    expect(albumSlugs()).toEqual(["discover", "a"]);
  });
});
