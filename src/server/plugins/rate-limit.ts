import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getAdminSession } from "./session.js";

/**
 * The site runs behind Cloudflare, so `request.ip` is the edge IP — every
 * visitor would otherwise share a single rate-limit bucket. Trust Cloudflare's
 * `CF-Connecting-IP` for the real client, falling back to the socket IP for
 * direct or local requests (dev, health checks).
 */
export function clientIp(request: FastifyRequest): string {
  const cf = request.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  if (Array.isArray(cf) && cf[0]) return cf[0];
  return request.ip;
}

/**
 * Loose global cap as an abuse backstop. The gallery is image-heavy — a single
 * album view fires many derivative/asset requests — so this is deliberately
 * generous and only meant to blunt floods, not shape normal browsing. Stricter
 * per-route limits (e.g. POST /admin/login) are layered on top via each route's
 * `config.rateLimit`.
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: true,
    max: 1000,
    timeWindow: "1 minute",
    keyGenerator: clientIp,
    // Authenticated admins bypass all rate limiting (global and per-route). The
    // cookie is parsed by @fastify/cookie, registered before this plugin, so
    // request.cookies is populated when allowList runs. Login itself is
    // unauthenticated, so its brute-force limit still applies.
    allowList: (request) => getAdminSession(request),
  });
}
