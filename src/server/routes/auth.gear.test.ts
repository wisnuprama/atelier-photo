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
    originals: "/tmp/atelier-gear-test/originals",
    derivatives: "/tmp/atelier-gear-test/derivatives",
  },
}));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { listGear } from "../services/gear.js";
import { authRoutes } from "./auth.js";

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

const LENS = "17mm F4 DG DN | Contemporary 023";

describe("POST /admin/gear/active", () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeEach(async () => {
    closeDb();
    migrate();
    const db = getDb();
    db.prepare(`INSERT INTO albums (id, slug, name) VALUES ('alb', 'a', 'A')`).run();
    db.prepare(
      `INSERT INTO photos (id, album_id, slug, filename, width, height, camera_body, lens)
       VALUES ('p1', 'alb', 's1', 'p1.jpg', 10, 10, 'SONY ILCE-7CM2', ?)`,
    ).run(LENS);
    app = await buildTestApp();
    cookie = await signIn(app);
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  function post(payload: Record<string, unknown>, withCookie = true) {
    return app.inject({
      method: "POST",
      url: "/admin/gear/active",
      headers: withCookie ? { cookie } : {},
      payload,
    });
  }

  it("returns 401 without a session, even with a valid body", async () => {
    const res = await post({ kind: "lens", name: LENS, active: false }, false);
    expect(res.statusCode).toBe(401);
    expect(listGear(consoleCtx).every((i) => i.active)).toBe(true);
  });

  it.each([
    ["a bad kind", { kind: "camera_body", name: LENS, active: false }],
    ["a non-string name", { kind: "lens", name: 42, active: false }],
    ["a non-boolean active", { kind: "lens", name: LENS, active: "false" }],
    ["missing fields", {}],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a missing body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/admin/gear/active",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a blank name", async () => {
    const res = await post({ kind: "lens", name: "  ", active: false });
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 for an unknown name", async () => {
    const res = await post({ kind: "lens", name: "Nope", active: false });
    expect(res.statusCode).toBe(404);
  });

  it("returns 204 and persists the flag", async () => {
    const res = await post({ kind: "lens", name: LENS, active: false });
    expect(res.statusCode).toBe(204);
    expect(listGear(consoleCtx).find((i) => i.kind === "lens")?.active).toBe(false);
    expect(listGear(consoleCtx).find((i) => i.kind === "camera")?.active).toBe(true);

    const back = await post({ kind: "lens", name: LENS, active: true });
    expect(back.statusCode).toBe(204);
    expect(listGear(consoleCtx).find((i) => i.kind === "lens")?.active).toBe(true);
  });
});
