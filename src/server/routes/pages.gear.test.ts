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
    contactEmail: "hi@example.com",
    contactGreeting: "Hello",
  },
  paths: {
    db: ":memory:",
    originals: "/tmp/atelier-gear-page-test/originals",
    derivatives: "/tmp/atelier-gear-page-test/derivatives",
  },
}));

import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import { migrate } from "../db/migrate.js";
import { setGearActive } from "../services/gear.js";
import { authRoutes } from "./auth.js";
import { pageRoutes } from "./pages.js";

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyCookie);
  await app.register(pageRoutes);
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

/** The HTML of one `<section data-gear-section="…">`, or "" when absent. */
function sectionHtml(html: string, section: string): string {
  const re = new RegExp(`<section[^>]*data-gear-section="${section}"[\\s\\S]*?</section>`);
  return html.match(re)?.[0] ?? "";
}

describe("GET /gear", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    closeDb();
    migrate();
    const db = getDb();
    db.prepare(`INSERT INTO albums (id, slug, name) VALUES ('alb', 'a', 'A')`).run();
    db.prepare(
      `INSERT INTO photos (id, album_id, slug, filename, width, height, taken_at, camera_body, lens)
       VALUES ('p1', 'alb', 's1', 'p1.jpg', 10, 10, '2025-03-01T00:00:00.000Z',
               'SONY ILCE-7CM2', 'FE 35mm F1.8')`,
    ).run();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
  });

  it("renders the page with the Gear nav marked current", async () => {
    const res = await app.inject({ method: "GET", url: "/gear" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("<title>My Gear — Still</title>");
    expect(res.body).toContain('<a href="/gear" class="text-ink" aria-current="page">Gear</a>');
    expect(res.body).toContain("SONY ILCE-7CM2");
    expect(res.body).toContain('href="/search?lens=FE+35mm+F1.8"');
  });

  it("has no admin controls for visitors", async () => {
    const res = await app.inject({ method: "GET", url: "/gear" });
    expect(res.body).not.toContain("data-gear-toggle");
    expect(res.body).not.toContain('id="gearStatus"');
  });

  it("renders one toggle per item and the admin strip for admins", async () => {
    const cookie = await signIn(app);
    const res = await app.inject({ method: "GET", url: "/gear", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.body.match(/data-gear-toggle/g)).toHaveLength(2);
    expect(res.body).toContain('id="gearStatus"');
  });

  it("renders an inactive item under the inactive section", async () => {
    setGearActive(consoleCtx, "lens", "FE 35mm F1.8", false);
    const res = await app.inject({ method: "GET", url: "/gear" });
    expect(sectionHtml(res.body, "inactive")).toContain("FE 35mm F1.8");
    expect(sectionHtml(res.body, "active")).not.toContain("FE 35mm F1.8");
    expect(sectionHtml(res.body, "active")).toContain("SONY ILCE-7CM2");
  });
});
