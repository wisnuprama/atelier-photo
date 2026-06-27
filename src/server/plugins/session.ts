import { createHmac, timingSafeEqual } from "node:crypto";
import "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

const COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const SESSION_TTL_S = SESSION_TTL_MS / 1000;

function sign(issuedAt: number): string {
  return createHmac("sha256", config.adminHmacSecret)
    .update(`admin:${issuedAt}`)
    .digest("hex");
}

export function setAdminSession(reply: FastifyReply): void {
  const issuedAt = Date.now();
  const value = `${issuedAt}.${sign(issuedAt)}`;
  reply.setCookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure: config.isProduction,
    maxAge: SESSION_TTL_S,
  });
}

export function getAdminSession(request: FastifyRequest): boolean {
  const raw = request.cookies[COOKIE_NAME];
  if (!raw) return false;
  const dot = raw.indexOf(".");
  if (dot < 1) return false;
  const issuedAt = Number(raw.slice(0, dot));
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > SESSION_TTL_MS) return false;
  const provided = raw.slice(dot + 1);
  const expected = sign(issuedAt);
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearAdminSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}
