import fastifyCookie from "@fastify/cookie";
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
    originals: "/tmp/atelier-upload-test/originals",
    derivatives: "/tmp/atelier-upload-test/derivatives",
  },
}));

vi.mock("../services/photos.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/photos.js")>();
  return {
    ...original,
    ingestPhoto: vi.fn(async () => ({ id: "p1", slug: "s1", status: "created" as const })),
  };
});

import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { ingestPhoto } from "../services/photos.js";
import { authRoutes } from "./auth.js";

const ingestPhotoMock = vi.mocked(ingestPhoto);

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

const BOUNDARY = "----uploadtestboundary";
const MULTIPART_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

function multipartBody(
  parts: Array<{ name: string; value: string | Buffer; filename?: string }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: image/jpeg`
      : `Content-Disposition: form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${disposition}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

describe("session album creation + photo upload routes", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    migrate();
    app = await buildTestApp();
    cookie = await signIn(app);
    ingestPhotoMock.mockClear();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  describe("POST /admin/albums/create", () => {
    it("returns 401 without a session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/albums/create",
        headers: { "content-type": "application/json" },
        payload: { name: "Iceland" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("returns 400 on a missing or blank name", async () => {
      for (const payload of [{}, { name: "" }, { name: "   " }]) {
        const res = await app.inject({
          method: "POST",
          url: "/admin/albums/create",
          headers: { "content-type": "application/json", cookie },
          payload,
        });
        expect(res.statusCode).toBe(400);
      }
    });

    it("creates the album and returns 201 with id + slug", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/albums/create",
        headers: { "content-type": "application/json", cookie },
        payload: { name: "Iceland, winter", description: "  south coast  " },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: string; slug: string };
      expect(body.slug).toBe("iceland-winter");

      const row = getDb()
        .prepare<[string], { name: string; description: string | null }>(
          `SELECT name, description FROM albums WHERE id = ?`,
        )
        .get(body.id);
      expect(row).toEqual({ name: "Iceland, winter", description: "south coast" });
    });

    it("dedupes slugs on repeated names", async () => {
      const slugs: string[] = [];
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/admin/albums/create",
          headers: { "content-type": "application/json", cookie },
          payload: { name: "Trip" },
        });
        expect(res.statusCode).toBe(201);
        slugs.push((res.json() as { slug: string }).slug);
      }
      expect(slugs).toEqual(["trip", "trip-2"]);
    });
  });

  describe("POST /admin/photos/upload", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    it("returns 401 without a session", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": MULTIPART_TYPE },
        payload: multipartBody([
          { name: "album", value: "mountains" },
          { name: "file", value: bytes, filename: "a.jpg" },
        ]),
      });
      expect(res.statusCode).toBe(401);
      expect(ingestPhotoMock).not.toHaveBeenCalled();
    });

    it("returns 415 on a non-multipart body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": "application/json", cookie },
        payload: { album: "mountains" },
      });
      expect(res.statusCode).toBe(415);
    });

    it("returns 400 when the album field is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": MULTIPART_TYPE, cookie },
        payload: multipartBody([{ name: "file", value: bytes, filename: "a.jpg" }]),
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: string }).error).toMatch(/album/i);
    });

    it("returns 400 when no file part is present", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": MULTIPART_TYPE, cookie },
        payload: multipartBody([{ name: "album", value: "mountains" }]),
      });
      expect(res.statusCode).toBe(400);
      expect(ingestPhotoMock).not.toHaveBeenCalled();
    });

    it("ingests the file and returns the result", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": MULTIPART_TYPE, cookie },
        payload: multipartBody([
          { name: "album", value: "mountains" },
          { name: "file", value: bytes, filename: "a.jpg" },
        ]),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ id: "p1", slug: "s1", status: "created" });

      expect(ingestPhotoMock).toHaveBeenCalledTimes(1);
      const input = ingestPhotoMock.mock.calls[0]?.[1];
      expect(input?.album).toBe("mountains");
      expect(input?.filename).toBe("a.jpg");
      expect(input?.data.equals(bytes)).toBe(true);
    });

    it("returns 400 when ingest fails", async () => {
      ingestPhotoMock.mockRejectedValueOnce(new Error("undecodable"));
      const res = await app.inject({
        method: "POST",
        url: "/admin/photos/upload",
        headers: { "content-type": MULTIPART_TYPE, cookie },
        payload: multipartBody([
          { name: "album", value: "mountains" },
          { name: "file", value: bytes, filename: "a.jpg" },
        ]),
      });
      expect(res.statusCode).toBe(400);
      expect((res.json() as { error: string }).error).toMatch(/process/i);
    });
  });
});
