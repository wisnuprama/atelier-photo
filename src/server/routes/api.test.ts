import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: {
    adminKeyId: "k",
    adminHmacSecret: "s",
    isProduction: false,
    dataDir: "/tmp/t",
    ingestConcurrency: 1,
  },
  paths: {
    db: ":memory:",
    originals: "/tmp/atelier-api-test/originals",
    derivatives: "/tmp/atelier-api-test/derivatives",
  },
}));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { createAlbum, ensureAlbum } from "../services/photos.js";
import { apiRoutes } from "./api.js";

/** Set `created_at` in the datetime('now') format (YYYY-MM-DD HH:MM:SS). */
function setCreatedAt(id: string, ts: string): void {
  getDb().prepare(`UPDATE albums SET created_at = ? WHERE id = ?`).run(ts, id);
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(apiRoutes, { prefix: "/api" });
  return app;
}

describe("GET /api/albums", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    migrate();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("returns { id, slug, name } per album, Discover first then newest first", async () => {
    const discoverId = ensureAlbum(consoleCtx, "discover", "Discover");
    setCreatedAt(discoverId, "2020-01-01 00:00:00");
    const a = createAlbum(consoleCtx, { name: "A" });
    setCreatedAt(a.id, "2024-01-01 00:00:00");
    const b = createAlbum(consoleCtx, { name: "B" });
    setCreatedAt(b.id, "2025-01-01 00:00:00");

    const res = await app.inject({ method: "GET", url: "/api/albums" });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { albums: Record<string, unknown>[] };
    expect(Object.keys(body)).toEqual(["albums"]);
    for (const album of body.albums) {
      expect(Object.keys(album).toSorted()).toEqual(["id", "name", "slug"]);
    }
    expect(body.albums.map((x) => x.slug)).toEqual(["discover", "b", "a"]);
    expect(body.albums[0]).toEqual({ id: discoverId, slug: "discover", name: "Discover" });
  });
});
