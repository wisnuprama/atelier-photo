import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    adminKeyId: "k",
    adminHmacSecret: "s",
    isProduction: false,
    dataDir: "/tmp/t",
    contactEmail: "",
    contactGreeting: "Hi",
    umamiWebsiteId: "",
  },
  paths: {
    db: ":memory:",
    originals: "/tmp/atelier-gear-search-test/originals",
    derivatives: "/tmp/atelier-gear-search-test/derivatives",
  },
}));

import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { pageRoutes } from "./pages.js";

const SIGMA = "17mm F4 DG DN | Contemporary 023";

function insertPhoto(id: string, camera: string, lens: string, takenAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO photos (id, album_id, slug, filename, width, height, taken_at, camera_body, lens)
       VALUES (?, 'alb', ?, ?, 10, 10, ?, ?, ?)`,
    )
    .run(id, `s-${id}`, `${id}.jpg`, takenAt, camera, lens);
}

function h1(html: string): string {
  return html.match(/<h1 id="searchTitle"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
}

describe("GET /search", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    migrate();
    getDb().prepare(`INSERT INTO albums (id, slug, name) VALUES ('alb', 'tokyo', 'Tokyo')`).run();
    insertPhoto("p1", "SONY ILCE-7CM2", SIGMA, "2025-03-01T00:00:00.000Z");
    insertPhoto("p2", "SONY ILCE-7CM2", "FE 35mm F1.8", "2025-02-01T00:00:00.000Z");
    insertPhoto("p3", "X100V", SIGMA, "2025-01-01T00:00:00.000Z");
    app = Fastify();
    await app.register(fastifyCookie);
    await app.register(pageRoutes);
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  const get = (url: string) => app.inject({ method: "GET", url });

  it("renders the no-filter empty state with the Gear nav current", async () => {
    const res = await get("/search");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(h1(res.body)).toBe("Search by gear");
    expect(res.body).toContain("<title>Search — Still</title>");
    expect(res.body).toContain("Browse my gear");
    expect(res.body).toContain('<a href="/gear" class="text-ink" aria-current="page">Gear</a>');
    expect(res.body).not.toContain('id="viewer-data"');
  });

  it("renders the no-match state for an unknown value", async () => {
    const res = await get("/search?lens=Unknown");
    expect(res.statusCode).toBe(200);
    expect(h1(res.body)).toBe("No photographs");
    expect(res.body).toContain("Nothing matches this gear yet.");
  });

  it("decodes + and %7C from a URLSearchParams-built link", async () => {
    const res = await get(`/search?${new URLSearchParams({ lens: SIGMA }).toString()}`);
    expect(res.statusCode).toBe(200);
    expect(h1(res.body)).toBe("2 Photographs");
    expect(res.body).toContain('id="photo-p1"');
    expect(res.body).toContain('id="photo-p3"');
    expect(res.body).not.toContain('id="photo-p2"');
    expect(res.body).toContain(`<title>${SIGMA} — Still</title>`);
  });

  it("ANDs camera and lens", async () => {
    const qs = new URLSearchParams({ camera: "SONY ILCE-7CM2", lens: SIGMA }).toString();
    const res = await get(`/search?${qs}`);
    expect(h1(res.body)).toBe("1 Photograph");
    expect(res.body).toContain('id="photo-p1"');
    expect(res.body).not.toContain('id="photo-p3"');
  });

  it("ignores a repeated key", async () => {
    const res = await get("/search?lens=a&lens=b");
    expect(res.statusCode).toBe(200);
    expect(h1(res.body)).toBe("Search by gear");
  });

  it("ignores an over-long value", async () => {
    const res = await get(`/search?lens=${"a".repeat(201)}`);
    expect(res.statusCode).toBe(200);
    expect(h1(res.body)).toBe("Search by gear");
  });

  it("treats a malformed percent sequence as a plain non-matching value", async () => {
    const res = await get("/search?lens=%E0%A4%A");
    expect(res.statusCode).toBe(200);
    expect(h1(res.body)).toBe("No photographs");
  });

  it("escapes the title once (raw title passed to layout)", async () => {
    const res = await get("/search?lens=A+%26+B");
    expect(res.body).toContain("<title>A &amp; B — Still</title>");
    expect(res.body).not.toContain("&amp;amp;");
  });
});
