import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import JSZip from "jszip";
import { config } from "../config.js";
import { ctxFromRequest } from "../context.js";
import { clearAdminSession, getAdminSession, setAdminSession } from "../plugins/session.js";
import { headerMatches, parseCsv, toCsv } from "../services/csv.js";
import { derivativePath } from "../services/derivatives.js";
import {
  deletePhoto,
  listAllPhotos,
  type PhotoFieldsInput,
  updatePhoto,
} from "../services/photos.js";
import { adminLoginPage } from "../views/admin-login.js";
import { adminPhotosPage } from "../views/admin-photos.js";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** HTTP status carried on a service-thrown Error (`statusCode`), defaulting to 500. */
function errStatus(err: unknown): number {
  return err instanceof Error && "statusCode" in err
    ? (err as Error & { statusCode: number }).statusCode
    : 500;
}

/** Column shape for the photo CSV export/import round-trip. */
const CSV_HEADER = ["id", "path", "title", "comment"] as const;

/** Per-photo result reported back by the bulk CSV import. */
interface ImportResult {
  id: string;
  status: "updated" | "not_found" | "error";
  message?: string;
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

  app.post(
    "/login",
    // Brute-force guard: cap secret attempts per client IP, well below the
    // loose global limit. Honored because the rate-limit plugin is registered
    // in a parent scope (see app.ts).
    { config: { rateLimit: { max: 3, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const body = request.body as Record<string, string>;
      const secret = body.secret?.trim() ?? "";
      const rawNext = body.next?.trim() ?? "/";
      const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

      if (!config.adminHmacSecret || !safeEqual(secret, config.adminHmacSecret)) {
        return reply.type("text/html").send(adminLoginPage({ error: "Invalid secret", next }));
      }

      setAdminSession(reply);
      return reply.redirect(next);
    },
  );

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
      if (errStatus(err) === 404) return reply.code(404).send({ error: "Photo not found" });
      throw err;
    }
  });

  // --- Admin photo table (session-protected) ------------------------------

  // Render the photo table page (full table view + JSON island for the client).
  app.get("/photos", async (request, reply) => {
    if (!getAdminSession(request)) {
      return reply.redirect("/admin/login?next=/admin/photos");
    }
    const rows = listAllPhotos(ctxFromRequest(request));
    return reply.type("text/html").send(adminPhotosPage(rows));
  });

  // Partial update of a single photo's title/commentary (inline auto-save).
  app.patch<{
    Params: { photoId: string };
    Body: PhotoFieldsInput;
  }>("/photos/:photoId", async (request, reply) => {
    if (!getAdminSession(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const body = (request.body ?? {}) as PhotoFieldsInput;
    const fields: PhotoFieldsInput = {};
    if ("title" in body) fields.title = body.title;
    if ("commentary" in body) fields.commentary = body.commentary;
    try {
      const photo = updatePhoto(ctxFromRequest(request), request.params.photoId, fields);
      return reply.code(200).send(photo);
    } catch (err: unknown) {
      const code = errStatus(err);
      if (code === 400) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : "Invalid fields" });
      }
      if (code === 404) return reply.code(404).send({ error: "Photo not found" });
      throw err;
    }
  });

  // Download a ZIP of photos.csv (saved server data) + the lowest-res JPEG of
  // each photo under images/{id}.jpg, referenced by the CSV's `path` column.
  app.get("/photos/export", async (request, reply) => {
    if (!getAdminSession(request)) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const ctx = ctxFromRequest(request);
    const rows = listAllPhotos(ctx);

    const zip = new JSZip();
    const csvRows: string[][] = [[...CSV_HEADER]];
    for (const row of rows) {
      const path = `images/${row.id}.jpg`;
      csvRows.push([row.id, path, row.title ?? "", row.commentary ?? ""]);
      try {
        zip.file(path, await readFile(derivativePath(row.id, "thumb", "jpeg")));
      } catch (err: unknown) {
        ctx.log.warn({ err, photoId: row.id }, "photos/export: missing thumb derivative");
      }
    }
    zip.file("photos.csv", toCsv(csvRows));

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", 'attachment; filename="photos.zip"')
      .send(buffer);
  });

  // Bulk update from an uploaded CSV. The client reads the file's text and posts
  // it as JSON { csv }, so this scope needs no multipart parser. Unknown ids and
  // invalid rows are reported but never abort the run (partial success).
  app.post<{ Body: { csv?: string } }>(
    "/photos/import",
    { bodyLimit: 16 * 1024 * 1024 }, // CSVs can be large for big libraries
    async (request, reply) => {
      if (!getAdminSession(request)) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const csv = (request.body as { csv?: string } | undefined)?.csv;
      if (typeof csv !== "string") {
        return reply.code(400).send({ error: "Missing csv field" });
      }

      const grid = parseCsv(csv);
      const header = grid[0];
      if (!header || !headerMatches(header, CSV_HEADER)) {
        return reply.code(400).send({ error: `CSV header must be: ${CSV_HEADER.join(",")}` });
      }

      const ctx = ctxFromRequest(request);
      const results: ImportResult[] = [];
      for (const cols of grid.slice(1)) {
        const id = (cols[0] ?? "").trim();
        if (!id) continue; // skip rows without an id
        try {
          updatePhoto(ctx, id, { title: cols[2] ?? "", commentary: cols[3] ?? "" });
          results.push({ id, status: "updated" });
        } catch (err: unknown) {
          if (errStatus(err) === 404) {
            results.push({ id, status: "not_found" });
          } else {
            results.push({
              id,
              status: "error",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
      return reply.code(200).send({ results });
    },
  );
}
