import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { adminRoutes } from "./routes/admin.js";
import { apiRoutes } from "./routes/api.js";
import { mediaRoutes } from "./routes/media.js";
import { pageRoutes } from "./routes/pages.js";

export async function buildApp(): Promise<FastifyInstance> {
  // Apply DB schema before any route can query it.
  migrate();

  const app = Fastify({
    logger: { level: config.isProduction ? "info" : "debug" },
  });

  // Compiled assets: /css/app.css and /js/app.js.
  const publicDir = resolve(process.cwd(), "public");
  mkdirSync(publicDir, { recursive: true });
  await app.register(fastifyStatic, { root: publicDir, prefix: "/" });

  await app.register(pageRoutes);
  await app.register(mediaRoutes);
  await app.register(apiRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/admin" });

  return app;
}
