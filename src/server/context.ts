import type { FastifyBaseLogger, FastifyRequest } from "fastify";

/**
 * Per-call dependencies passed explicitly into services (lightweight DI).
 * Currently just the logger so the same instance flows from routes into
 * services; extend with more deps here as needed.
 */
export interface Ctx {
  log: FastifyBaseLogger;
}

/** Build a Ctx from a Fastify request, reusing its per-request child logger. */
export function ctxFromRequest(request: FastifyRequest): Ctx {
  return { log: request.log };
}

/** Ctx for non-request callers (CLI scripts, tests): logs to the console. */
export const consoleCtx: Ctx = { log: console as unknown as FastifyBaseLogger };
