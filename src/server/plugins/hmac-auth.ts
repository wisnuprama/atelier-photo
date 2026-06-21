import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { config } from "../config.js";

/** Reject requests whose timestamp is more than this far from now (replay window). */
const MAX_SKEW_MS = 5 * 60 * 1000;

function unauthorized(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 401;
  return err;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Verify an HMAC-signed admin request against its raw body bytes. Throws a 401
 * error on any failure (missing/wrong key, stale timestamp, bad signature).
 *
 *   Signature = HMAC-SHA256(ADMIN_HMAC_SECRET, `${X-Timestamp}.` + <raw body bytes>)
 */
export function verifyHmac(request: FastifyRequest, rawBody: Buffer): void {
  if (!config.adminKeyId || !config.adminHmacSecret) {
    throw unauthorized("admin credentials not configured");
  }

  const keyId = request.headers["x-key-id"];
  const timestamp = request.headers["x-timestamp"];
  const signature = request.headers["x-signature"];
  if (typeof keyId !== "string" || typeof timestamp !== "string" || typeof signature !== "string") {
    throw unauthorized("missing X-Key-Id / X-Timestamp / X-Signature");
  }

  if (!safeEqual(keyId, config.adminKeyId)) {
    throw unauthorized("unknown key id");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > MAX_SKEW_MS) {
    throw unauthorized("timestamp outside the allowed window");
  }

  const expected = createHmac("sha256", config.adminHmacSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  if (!safeEqual(signature, expected)) {
    throw unauthorized("signature mismatch");
  }
}
