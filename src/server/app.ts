import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { adminRoutes } from "./routes/admin.js";
import { apiRoutes } from "./routes/api.js";
import { authRoutes } from "./routes/auth.js";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { mediaRoutes } from "./routes/media.js";
import { pageRoutes } from "./routes/pages.js";
import { layout } from "./views/layout.js";

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
  await app.register(fastifyCookie);

  // Register before routes so per-route `config.rateLimit` overrides apply.
  await registerRateLimit(app);

  await app.register(pageRoutes);
  await app.register(mediaRoutes);
  await app.register(apiRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/admin" });
  await app.register(adminRoutes, { prefix: "/admin" });

  app.setErrorHandler((_error, _request, reply) => {
    const html = layout({
      title: "Error — Still",
      body: `<main class="max-w-[1200px] mx-auto px-5 sm:px-8 py-24">
        <p class="font-mono text-[10px] label text-stone uppercase">500</p>
        <h1 class="font-serif text-[32px] mt-3">Something went wrong</h1>
        <p class="mt-4"><a class="font-mono text-[11px] label uppercase text-stone hover:text-ink" href="/">← Back to albums</a></p>
      </main>`,
    });
    return reply.code(500).type("text/html").send(html);
  });

  app.setNotFoundHandler((_request, reply) => {
    const html = layout({
      title: "Not found — Still",
      body: `<main class="max-w-[1200px] mx-auto px-5 sm:px-8 py-24">
        <p class="font-mono text-[10px] label text-stone uppercase">404</p>
        <h1 class="font-serif text-[32px] mt-3">Page not found</h1>
        <p class="mt-4"><a class="font-mono text-[11px] label uppercase text-stone hover:text-ink" href="/">← Back to albums</a></p>
      </main>`,
    });
    return reply.code(404).type("text/html").send(html);
  });

  return app;
}
