import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: { adminKeyId: "k", adminHmacSecret: "s", isProduction: false, dataDir: "/tmp/t" },
  paths: { db: ":memory:", originals: "/tmp/t/originals", derivatives: "/tmp/t/derivatives" },
}));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { GEAR_COLUMN, isGearKind, listGear, setGearActive } from "./gear.js";

let seq = 0;

interface PhotoSeed {
  id?: string;
  camera?: string | null;
  lens?: string | null;
  takenAt?: string | null;
  createdAt?: string;
  title?: string | null;
}

function insertPhoto(p: PhotoSeed): string {
  seq += 1;
  const id = p.id ?? `p${seq}`;
  getDb()
    .prepare(
      `INSERT INTO photos (id, album_id, slug, filename, title, taken_at, width, height,
                           thumbhash, camera_body, lens, created_at)
       VALUES (?, 'alb', ?, ?, ?, ?, 30, 20, 'th', ?, ?, ?)`,
    )
    .run(
      id,
      `s-${id}`,
      `${id}.jpg`,
      p.title ?? null,
      p.takenAt ?? null,
      p.camera ?? null,
      p.lens ?? null,
      p.createdAt ?? "2026-01-01 00:00:00",
    );
  return id;
}

function errStatus(fn: () => void): number | undefined {
  try {
    fn();
  } catch (err) {
    return (err as Error & { statusCode?: number }).statusCode;
  }
  return undefined;
}

beforeEach(() => {
  closeDb();
  migrate();
  getDb().prepare(`INSERT INTO albums (id, slug, name) VALUES ('alb', 'a', 'A')`).run();
});

afterEach(() => {
  closeDb();
});

describe("isGearKind / GEAR_COLUMN", () => {
  it("accepts only camera and lens", () => {
    expect(isGearKind("camera")).toBe(true);
    expect(isGearKind("lens")).toBe(true);
    expect(isGearKind("camera_body")).toBe(false);
    expect(isGearKind(1)).toBe(false);
    expect(isGearKind(undefined)).toBe(false);
  });

  it("maps kinds to photo columns", () => {
    expect(GEAR_COLUMN).toEqual({ camera: "camera_body", lens: "lens" });
  });
});

describe("listGear", () => {
  it("returns an empty list with no photos", () => {
    expect(listGear(consoleCtx)).toEqual([]);
  });

  it("groups distinct camera and lens values with counts", () => {
    insertPhoto({ camera: "A7", lens: "35mm", takenAt: "2025-01-01T00:00:00.000Z" });
    insertPhoto({ camera: "A7", lens: "85mm", takenAt: "2025-02-01T00:00:00.000Z" });
    insertPhoto({ camera: "X100V", lens: "35mm", takenAt: "2024-01-01T00:00:00.000Z" });

    const items = listGear(consoleCtx);
    const find = (kind: string, name: string) =>
      items.find((i) => i.kind === kind && i.name === name);
    expect(items).toHaveLength(4);
    expect(find("camera", "A7")?.photoCount).toBe(2);
    expect(find("camera", "X100V")?.photoCount).toBe(1);
    expect(find("lens", "35mm")?.photoCount).toBe(2);
    expect(find("lens", "85mm")?.photoCount).toBe(1);
  });

  it("excludes NULL and blank values", () => {
    insertPhoto({ camera: null, lens: "" });
    insertPhoto({ camera: "   ", lens: null });
    insertPhoto({ camera: "A7" });
    expect(listGear(consoleCtx).map((i) => `${i.kind}:${i.name}`)).toEqual(["camera:A7"]);
  });

  it("defaults to active and flips with upserts (one row)", () => {
    insertPhoto({ lens: "35mm" });
    expect(listGear(consoleCtx)[0]?.active).toBe(true);

    setGearActive(consoleCtx, "lens", "35mm", false);
    expect(listGear(consoleCtx)[0]?.active).toBe(false);

    setGearActive(consoleCtx, "lens", "35mm", true);
    expect(listGear(consoleCtx)[0]?.active).toBe(true);

    const count = getDb().prepare(`SELECT COUNT(*) AS n FROM gear`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("derives first/last year in UTC from MIN/MAX taken_at", () => {
    insertPhoto({ camera: "A7", takenAt: "2021-12-31T23:30:00.000Z" });
    insertPhoto({ camera: "A7", takenAt: "2024-06-01T00:00:00.000Z" });
    insertPhoto({ camera: "A7", takenAt: null });
    insertPhoto({ camera: "Solo", takenAt: "2025-05-05T00:00:00.000Z" });
    insertPhoto({ camera: "Undated", takenAt: null });

    const items = listGear(consoleCtx);
    const a7 = items.find((i) => i.name === "A7");
    expect(a7?.firstYear).toBe(2021);
    expect(a7?.lastYear).toBe(2024);
    expect(a7?.photoCount).toBe(3);
    const solo = items.find((i) => i.name === "Solo");
    expect(solo?.firstYear).toBe(2025);
    expect(solo?.lastYear).toBe(2025);
    const undated = items.find((i) => i.name === "Undated");
    expect(undated?.firstYear).toBeNull();
    expect(undated?.lastYear).toBeNull();
  });

  it("orders by last use (undated last), then count, then name", () => {
    insertPhoto({ camera: "Old", takenAt: "2020-01-01T00:00:00.000Z" });
    insertPhoto({ camera: "New", takenAt: "2026-01-01T00:00:00.000Z" });
    insertPhoto({ camera: "Undated B" });
    insertPhoto({ camera: "Undated A" });
    insertPhoto({ camera: "Undated B" });
    expect(listGear(consoleCtx).map((i) => i.name)).toEqual([
      "New",
      "Old",
      "Undated B",
      "Undated A",
    ]);
  });

  it("picks the latest sample by taken_at DESC, created_at DESC", () => {
    insertPhoto({ id: "undated", camera: "A7", takenAt: null, createdAt: "2027-01-01 00:00:00" });
    insertPhoto({ id: "old", camera: "A7", takenAt: "2024-01-01T00:00:00.000Z" });
    insertPhoto({
      id: "tie-early",
      camera: "A7",
      takenAt: "2025-01-01T00:00:00.000Z",
      createdAt: "2026-01-01 00:00:00",
    });
    insertPhoto({
      id: "tie-late",
      camera: "A7",
      takenAt: "2025-01-01T00:00:00.000Z",
      createdAt: "2026-02-01 00:00:00",
      title: "Harbour",
    });

    const [item] = listGear(consoleCtx);
    expect(item?.sample).toEqual({
      id: "tie-late",
      width: 30,
      height: 20,
      thumbhash: "th",
      title: "Harbour",
    });
  });

  it("round-trips names with |, spaces and non-ASCII; case variants stay separate", () => {
    const names = ["17mm F4 DG DN | Contemporary 023", "Objektiv Größe 50mm", "sony a7", "SONY A7"];
    for (const lens of names) insertPhoto({ lens });
    const listed = listGear(consoleCtx).map((i) => i.name);
    expect(listed.toSorted()).toEqual(names.toSorted());

    setGearActive(consoleCtx, "lens", "17mm F4 DG DN | Contemporary 023", false);
    setGearActive(consoleCtx, "lens", "Objektiv Größe 50mm", false);
    const inactive = listGear(consoleCtx)
      .filter((i) => !i.active)
      .map((i) => i.name);
    expect(inactive.toSorted()).toEqual([
      "17mm F4 DG DN | Contemporary 023",
      "Objektiv Größe 50mm",
    ]);
    expect(listGear(consoleCtx).find((i) => i.name === "sony a7")?.active).toBe(true);
  });

  it("ignores orphan gear rows with no photos", () => {
    getDb().prepare(`INSERT INTO gear (kind, name, active) VALUES ('lens', 'Gone', 0)`).run();
    insertPhoto({ lens: "Here" });
    expect(listGear(consoleCtx).map((i) => i.name)).toEqual(["Here"]);
  });
});

describe("setGearActive", () => {
  beforeEach(() => {
    insertPhoto({ camera: "A7", lens: "35mm" });
  });

  it("throws 404 for an unknown name", () => {
    expect(errStatus(() => setGearActive(consoleCtx, "lens", "Nope", false))).toBe(404);
  });

  it("is kind-scoped: a camera name toggled as a lens is 404", () => {
    expect(errStatus(() => setGearActive(consoleCtx, "lens", "A7", false))).toBe(404);
    expect(errStatus(() => setGearActive(consoleCtx, "camera", "35mm", false))).toBe(404);
  });

  it("throws 400 for a blank or over-long name", () => {
    expect(errStatus(() => setGearActive(consoleCtx, "lens", "", false))).toBe(400);
    expect(errStatus(() => setGearActive(consoleCtx, "lens", "   ", false))).toBe(400);
    expect(errStatus(() => setGearActive(consoleCtx, "lens", "x".repeat(201), false))).toBe(400);
  });

  it("does not trim the stored name", () => {
    expect(errStatus(() => setGearActive(consoleCtx, "lens", " 35mm ", false))).toBe(404);
  });
});
