import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import fastifyCookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";

vi.mock("../config.js", () => ({
  config: { adminKeyId: "k", adminHmacSecret: "s", isProduction: false, dataDir: "/tmp/t" },
  paths: {
    db: ":memory:",
    originals: "/tmp/atelier-auth-test/originals",
    derivatives: "/tmp/atelier-auth-test/derivatives",
  },
}));

const DERIVATIVES_DIR = "/tmp/atelier-auth-test/derivatives";

import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { authRoutes } from "./auth.js";

/** Seed an album plus a photo row so the table routes have data to operate on. */
function insertPhoto(
  id: string,
  opts: { title?: string | null; commentary?: string | null } = {},
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO albums (id, slug, name) VALUES ('alb', 'mountains', 'Mountains')
       ON CONFLICT(id) DO NOTHING`,
  ).run();
  db.prepare(
    `INSERT INTO photos (id, album_id, slug, filename, title, commentary, width, height)
     VALUES (?, 'alb', ?, ?, ?, ?, 10, 10)`,
  ).run(id, `slug-${id}`, `${id}.jpg`, opts.title ?? null, opts.commentary ?? null);
}

/** Write a fake lowest-res JPEG derivative so the export route can read it. */
function writeThumb(id: string, bytes = "jpeg-bytes"): void {
  const dir = join(DERIVATIVES_DIR, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "thumb.jpeg"), bytes);
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyCookie);
  await app.register(authRoutes, { prefix: "/admin" });
  return app;
}

/** Sign in through POST /admin/login and return the session cookie header value. */
async function signIn(app: FastifyInstance): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/admin/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "secret=s&next=/",
  });
  const cookie = res.cookies.find((c) => c.name === "admin_session");
  if (!cookie) throw new Error("login did not set a session cookie");
  return `${cookie.name}=${cookie.value}`;
}

describe("admin photo table routes", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    closeDb();
    rmSync("/tmp/atelier-auth-test", { recursive: true, force: true });
    migrate();
    app = await buildTestApp();
    cookie = await signIn(app);
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    rmSync("/tmp/atelier-auth-test", { recursive: true, force: true });
  });

  describe("auth gate (no session)", () => {
    it("redirects GET /admin/photos to login", async () => {
      const res = await app.inject({ method: "GET", url: "/admin/photos" });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/admin/login?next=/admin/photos");
    });

    it("rejects PATCH / export / import with 401", async () => {
      const patch = await app.inject({
        method: "PATCH",
        url: "/admin/photos/p1",
        payload: { title: "x" },
      });
      const exp = await app.inject({ method: "GET", url: "/admin/photos/export" });
      const imp = await app.inject({
        method: "POST",
        url: "/admin/photos/import",
        payload: { csv: "" },
      });
      expect(patch.statusCode).toBe(401);
      expect(exp.statusCode).toBe(401);
      expect(imp.statusCode).toBe(401);
    });
  });

  describe("GET /admin/photos (authed)", () => {
    it("renders the page", async () => {
      insertPhoto("p1", { title: "Hi" });
      const res = await app.inject({ method: "GET", url: "/admin/photos", headers: { cookie } });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
    });
  });

  describe("PATCH /admin/photos/:id", () => {
    it("updates title + commentary and persists to the DB", async () => {
      insertPhoto("p1", { title: "Old", commentary: "Old note" });
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/photos/p1",
        headers: { cookie },
        payload: { title: "  New  ", commentary: "  New note  " },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: "p1", title: "New", commentary: "New note" });

      const row = getDb()
        .prepare<[], { title: string; commentary: string }>(
          `SELECT title, commentary FROM photos WHERE id = 'p1'`,
        )
        .get();
      expect(row).toEqual({ title: "New", commentary: "New note" });
    });

    it("stores empty commentary as null", async () => {
      insertPhoto("p1", { commentary: "something" });
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/photos/p1",
        headers: { cookie },
        payload: { commentary: "   " },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().commentary).toBeNull();
    });

    it("rejects an empty title with 400", async () => {
      insertPhoto("p1", { title: "Keep" });
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/photos/p1",
        headers: { cookie },
        payload: { title: "   " },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/admin/photos/missing",
        headers: { cookie },
        payload: { title: "x" },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /admin/photos/export", () => {
    it("returns a ZIP with photos.csv and images/{id}.jpg per photo", async () => {
      insertPhoto("p1", { title: "Sea, sky", commentary: 'He said "hi"' });
      insertPhoto("p2", { title: "Hills" });
      writeThumb("p1");
      writeThumb("p2");

      const res = await app.inject({
        method: "GET",
        url: "/admin/photos/export",
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/zip");
      expect(res.headers["content-disposition"]).toContain('filename="photos.zip"');

      const zip = await JSZip.loadAsync(res.rawPayload);
      const csv = await zip.file("photos.csv")!.async("string");
      expect(csv.split("\r\n")[0]).toBe("id,path,title,comment");
      // Quoting of fields with commas/quotes is handled by toCsv.
      expect(csv).toContain('"Sea, sky"');
      expect(csv).toContain('"He said ""hi"""');
      expect(zip.file("images/p1.jpg")).not.toBeNull();
      expect(zip.file("images/p2.jpg")).not.toBeNull();
    });

    it("omits missing derivatives but still lists the row in the CSV", async () => {
      insertPhoto("p1", { title: "No image" });
      const res = await app.inject({
        method: "GET",
        url: "/admin/photos/export",
        headers: { cookie },
      });
      const zip = await JSZip.loadAsync(res.rawPayload);
      const csv = await zip.file("photos.csv")!.async("string");
      expect(csv).toContain("p1,images/p1.jpg,No image,");
      expect(zip.file("images/p1.jpg")).toBeNull();
    });
  });

  describe("POST /admin/photos/import", () => {
    it("updates matched rows and reports per-row status (partial success)", async () => {
      insertPhoto("p1", { title: "Old1" });
      insertPhoto("p2", { title: "Old2" });
      const csv = [
        "id,path,title,comment",
        "p1,images/p1.jpg,New1,Note1",
        "ghost,images/ghost.jpg,Whatever,",
        "p2,images/p2.jpg,New2,",
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/import",
        headers: { cookie },
        payload: { csv },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().results).toEqual([
        { id: "p1", status: "updated" },
        { id: "ghost", status: "not_found" },
        { id: "p2", status: "updated" },
      ]);

      const titles = getDb()
        .prepare<[], { id: string; title: string }>(`SELECT id, title FROM photos ORDER BY id`)
        .all();
      expect(titles).toEqual([
        { id: "p1", title: "New1" },
        { id: "p2", title: "New2" },
      ]);
    });

    it("reports an invalid-title row as error without aborting others", async () => {
      insertPhoto("p1", { title: "Keep1" });
      insertPhoto("p2", { title: "Keep2" });
      const csv = [
        "id,path,title,comment",
        "p1,images/p1.jpg,,note", // empty title -> error
        "p2,images/p2.jpg,Updated,",
      ].join("\r\n");

      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/import",
        headers: { cookie },
        payload: { csv },
      });
      const results = res.json().results;
      expect(results[0]).toMatchObject({ id: "p1", status: "error" });
      expect(results[1]).toEqual({ id: "p2", status: "updated" });

      const p2 = getDb().prepare(`SELECT title FROM photos WHERE id = 'p2'`).get();
      expect(p2).toEqual({ title: "Updated" });
    });

    it("rejects a CSV with the wrong header (400)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/import",
        headers: { cookie },
        payload: { csv: "wrong,header\n1,2" },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
