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
  ingestPhoto,
  listAllPhotos,
  normalizePhotoFields,
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
    });
  });
});
