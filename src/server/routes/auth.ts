import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { ctxFromRequest } from "../context.js";
import { clearAdminSession, getAdminSession, setAdminSession } from "../plugins/session.js";
import { deletePhoto } from "../services/photos.js";
import { adminLoginPage } from "../views/admin-login.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Session-based admin routes — no HMAC headers required.
 * Mounted under /admin alongside the HMAC-protected upload routes.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_req, body, done) => {
      const params = new URLSearchParams(body as string);
      const obj: Record<string, string> = {};
      params.forEach((v, k) => {
        obj[k] = v;
      });
      done(null, obj);
    },
  );

  app.get("/login", async (request, reply) => {
    if (getAdminSession(request)) return reply.redirect("/");
    const next = (request.query as Record<string, string>).next ?? "/";
    return reply.type("text/html").send(adminLoginPage({ next }));
  });

  app.post("/login", async (request, reply) => {
    const body = request.body as Record<string, string>;
    const secret = body.secret?.trim() ?? "";
    const rawNext = body.next?.trim() ?? "/";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

    if (!config.adminHmacSecret || !safeEqual(secret, config.adminHmacSecret)) {
      return reply.type("text/html").send(adminLoginPage({ error: "Invalid secret", next }));
    }

    setAdminSession(reply);
    return reply.redirect(next);
  });

  app.post("/logout", async (_request, reply) => {
    clearAdminSession(reply);
    return reply.redirect("/");
  });

  app.delete<{ Params: { photoId: string } }>("/photos/:photoId", async (request, reply) => {
    if (!getAdminSession(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    try {
      await deletePhoto(ctxFromRequest(request), request.params.photoId);
      return reply.code(204).send();
    } catch (err: unknown) {
      const code =
        err instanceof Error && "statusCode" in err
          ? (err as Error & { statusCode: number }).statusCode
          : 500;
      if (code === 404) return reply.code(404).send({ error: "Photo not found" });
      throw err;
    }
  });
}
