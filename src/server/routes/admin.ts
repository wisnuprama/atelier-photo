import { Readable } from "node:stream";
import busboy from "busboy";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verifyHmac } from "../plugins/hmac-auth.js";
import { createAlbum, ingestPhoto, type IngestResult } from "../services/photos.js";

const MAX_BODY = 60 * 1024 * 1024; // 60 MB per request

interface ParsedMultipart {
  fields: Record<string, string>;
  files: Array<{ filename: string; data: Buffer }>;
}

/** Parse a buffered multipart/form-data body with busboy. */
function parseMultipart(headers: FastifyRequest["headers"], raw: Buffer): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers, limits: { fileSize: MAX_BODY, files: 50 } });
    const fields: Record<string, string> = {};
    const files: ParsedMultipart["files"] = [];

    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => files.push({ filename: info.filename, data: Buffer.concat(chunks) }));
      stream.on("error", reject);
    });
    bb.on("close", () => resolve({ fields, files }));
    bb.on("error", reject);

    Readable.from(raw).pipe(bb);
  });
}

/**
 * Admin ingestion — HMAC-protected, mounted under /admin.
 *
 * Auth headers on every request:
 *   X-Key-Id     — your key id (config ADMIN_KEY_ID)
 *   X-Timestamp  — current time in epoch milliseconds
 *   X-Signature  — hex HMAC-SHA256 over `${X-Timestamp}.` + <raw request body bytes>
 *                  using ADMIN_HMAC_SECRET. Requests outside a ±5 min window are rejected.
 *
 * iOS Shortcut contract (all requests multipart/form-data so the raw body feeds
 * both HMAC verification and the parser):
 *
 *   POST /admin/albums — create a named album once.
 *     name        — album name (text field, required)
 *     slug        — optional explicit slug (derived from name otherwise)
 *     description — optional text field
 *     → 201 { id, slug }
 *
 *   GET  /api/albums   — list { id, slug, name } to pick a target slug from.
 *
 *   POST /admin/photos — ingest (bulk-capable).
 *     file        — original image part(s); the original filename is preserved and
 *                   re-uploading the same (album, filename) replaces the entry.
 *     album       — target album slug (text field, optional; default "discover")
 *     title       — optional text field
 *     commentary  — optional text field
 *     → 200 { status, created, replaced, photos }
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Buffer the raw body so the exact bytes feed both HMAC verification and the
  // multipart parser (@fastify/multipart reads request.raw, which we cannot
  // consume early without breaking it — so we own the parsing here).
  app.addContentTypeParser(
    "multipart/form-data",
    { parseAs: "buffer", bodyLimit: MAX_BODY },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Verify HMAC over the raw buffered body before any handler runs.
  app.addHook("preValidation", async (request) => {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    verifyHmac(request, raw);
  });

  app.post("/albums", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data") || !Buffer.isBuffer(request.body)) {
      return reply.code(415).send({ error: "expected multipart/form-data" });
    }

    const { fields } = await parseMultipart(request.headers, request.body);
    const name = fields.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: "missing name field" });
    }

    const album = createAlbum({ name, slug: fields.slug, description: fields.description });
    return reply.code(201).send(album);
  });

  app.post("/photos", async (request, reply) => {
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data") || !Buffer.isBuffer(request.body)) {
      return reply.code(415).send({ error: "expected multipart/form-data" });
    }

    const { fields, files } = await parseMultipart(request.headers, request.body);
    if (files.length === 0) {
      return reply.code(400).send({ error: "no file parts in request" });
    }

    const photos: IngestResult[] = [];
    let created = 0;
    let replaced = 0;
    for (const file of files) {
      const result = await ingestPhoto({
        album: fields.album,
        filename: file.filename,
        title: fields.title,
        commentary: fields.commentary,
        data: file.data,
      });
      photos.push(result);
      if (result.status === "created") created++;
      else replaced++;
    }

    return reply.code(200).send({ status: "ok", created, replaced, photos });
  });
}
