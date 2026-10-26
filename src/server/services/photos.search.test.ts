import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: { adminKeyId: "k", adminHmacSecret: "s", isProduction: false, dataDir: "/tmp/t" },
  paths: { db: ":memory:", originals: "/tmp/t/originals", derivatives: "/tmp/t/derivatives" },
}));

// photos.ts imports these; mock them as photos.test.ts does.
vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./derivatives.js", () => ({ generateDerivatives: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./exif.js", () => ({ extractExif: vi.fn().mockResolvedValue({}) }));
vi.mock("./thumbhash.js", () => ({ computeThumbHash: vi.fn().mockResolvedValue(null) }));
vi.mock("sharp", () => ({ default: vi.fn() }));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { searchPhotos } from "./photos.js";

const SIGMA = "17mm F4 DG DN | Contemporary 023";

interface Seed {
  id: string;
  album?: "a1" | "a2";
  camera?: string | null;
  lens?: string | null;
  takenAt?: string | null;
  createdAt?: string;
}

function insertPhoto(s: Seed): void {
  getDb()
    .prepare(
      `INSERT INTO photos (id, album_id, slug, filename, width, height, taken_at, created_at, camera_body, lens)
       VALUES (?, ?, ?, ?, 10, 10, ?, ?, ?, ?)`,
    )
    .run(
      s.id,
      s.album ?? "a1",
      `slug-${s.id}`,
      `${s.id}.jpg`,
      s.takenAt ?? null,
      s.createdAt ?? "2026-01-01T00:00:00.000Z",
      s.camera ?? null,
      s.lens ?? null,
    );
}

const ids = (filters: Parameters<typeof searchPhotos>[1]) =>
  searchPhotos(consoleCtx, filters).map((p) => p.id);

describe("searchPhotos", () => {
  beforeEach(() => {
    closeDb();
    migrate();
    const db = getDb();
    db.prepare(`INSERT INTO albums (id, slug, name) VALUES ('a1', 'tokyo', 'Tokyo Nights')`).run();
    db.prepare(`INSERT INTO albums (id, slug, name) VALUES ('a2', 'kyoto', 'Kyoto')`).run();
  });

  afterEach(() => {
    closeDb();
  });

  it("filters by camera only, lens only, and both (AND)", () => {
    insertPhoto({ id: "p1", camera: "A7", lens: "35mm", takenAt: "2025-03-01T00:00:00.000Z" });
    insertPhoto({ id: "p2", camera: "A7", lens: "85mm", takenAt: "2025-02-01T00:00:00.000Z" });
    insertPhoto({ id: "p3", camera: "X100", lens: "35mm", takenAt: "2025-01-01T00:00:00.000Z" });

    expect(ids({ camera: "A7" })).toEqual(["p1", "p2"]);
    expect(ids({ lens: "35mm" })).toEqual(["p1", "p3"]);
    expect(ids({ camera: "A7", lens: "35mm" })).toEqual(["p1"]);
  });

  it("returns [] for no filters and for no match", () => {
    insertPhoto({ id: "p1", camera: "A7", lens: "35mm" });
    expect(searchPhotos(consoleCtx, {})).toEqual([]);
    expect(ids({ lens: "Unknown" })).toEqual([]);
  });

  it("matches names with | and spaces exactly, case-sensitively", () => {
    insertPhoto({ id: "p1", lens: SIGMA });
    expect(ids({ lens: SIGMA })).toEqual(["p1"]);
    expect(ids({ lens: SIGMA.toLowerCase() })).toEqual([]);
    expect(ids({ lens: "17mm F4 DG DN" })).toEqual([]);
  });

  it("spans albums and carries album slug and name", () => {
    insertPhoto({ id: "p1", album: "a1", lens: "35mm", takenAt: "2025-03-01T00:00:00.000Z" });
    insertPhoto({ id: "p2", album: "a2", lens: "35mm", takenAt: "2025-02-01T00:00:00.000Z" });
    const res = searchPhotos(consoleCtx, { lens: "35mm" });
    expect(res.map((p) => [p.id, p.albumSlug, p.albumName])).toEqual([
      ["p1", "tokyo", "Tokyo Nights"],
      ["p2", "kyoto", "Kyoto"],
    ]);
    expect(res[0]).toMatchObject({ albumId: "a1", lens: "35mm", filename: "p1.jpg" });
  });

  it("orders by taken_at DESC (undated last), then created_at DESC, then id", () => {
    const t = "2025-05-01T00:00:00.000Z";
    insertPhoto({ id: "undated", lens: "L", takenAt: null });
    insertPhoto({ id: "old", lens: "L", takenAt: "2024-01-01T00:00:00.000Z" });
    insertPhoto({ id: "tie-b", lens: "L", takenAt: t, createdAt: "2026-01-01T00:00:00.000Z" });
    insertPhoto({ id: "tie-a", lens: "L", takenAt: t, createdAt: "2026-01-01T00:00:00.000Z" });
    insertPhoto({ id: "tie-new", lens: "L", takenAt: t, createdAt: "2026-02-01T00:00:00.000Z" });
    insertPhoto({ id: "newest", lens: "L", takenAt: "2025-09-01T00:00:00.000Z" });

    expect(ids({ lens: "L" })).toEqual(["newest", "tie-new", "tie-a", "tie-b", "old", "undated"]);
  });

  it("binds hostile values as parameters", () => {
    insertPhoto({ id: "p1", lens: "35mm", camera: "A7" });
    expect(ids({ lens: "' OR 1=1 --" })).toEqual([]);
    expect(ids({ camera: '" OR ""="' })).toEqual([]);
  });

  it("has the gear indexes and migrate() is idempotent", () => {
    const names = getDb()
      .prepare<[], { name: string }>(`SELECT name FROM sqlite_master WHERE type = 'index'`)
      .all()
      .map((r) => r.name);
    expect(names).toContain("idx_photos_camera");
    expect(names).toContain("idx_photos_lens");
    expect(() => migrate()).not.toThrow();
  });
});
