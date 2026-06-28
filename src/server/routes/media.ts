import { createReadStream, existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { ctxFromRequest } from "../context.js";
import { DERIVATIVE_FORMATS, DERIVATIVE_NAMES, derivativePath } from "../services/derivatives.js";
import { getPhoto } from "../services/photos.js";

/**
 * Generated grey placeholder frame, sized to the photo's real aspect ratio.
 * Served only when no derivative exists yet; keeps layout stable (no CLS).
 */
function placeholderSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#e6e6e6"/>
    <rect x="1%" y="1%" width="98%" height="98%" fill="none" stroke="#d4d4d4" stroke-width="2"/>
  </svg>`;
}

/** Whether the client's Accept header admits a given format's MIME type. */
function clientAccepts(accept: string, mime: string): boolean {
  if (!accept || accept.includes("*/*") || accept.includes("image/*")) return true;
  return accept.includes(mime);
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { photoId: string; variant: string } }>(
    "/media/:photoId/:variant",
    async (request, reply) => {
      const { photoId, variant } = request.params;
      if (!DERIVATIVE_NAMES.has(variant)) {
        return reply.code(404).send({ error: "unknown variant" });
      }

      const photo = getPhoto(ctxFromRequest(request), photoId);
      if (!photo) {
        return reply.code(404).send({ error: "photo not found" });
      }

      // Content negotiation: serve the best format the client accepts in
      // preference order (avif → webp → jpeg). The URL stays single, so the
      // client's data-src + IntersectionObserver lazyload is unchanged.
      const accept = request.headers.accept ?? "";
      for (const format of DERIVATIVE_FORMATS) {
        if (!clientAccepts(accept, format.mime)) continue;
        const file = derivativePath(photoId, variant, format.ext);
        if (existsSync(file)) {
          reply.header("Vary", "Accept");
          reply.header("Cache-Control", "public, max-age=31536000, immutable");
          return reply.type(format.mime).send(createReadStream(file));
        }
      }

      // No derivative on disk yet: serve a sized placeholder (short-lived cache).
      reply.header("Vary", "Accept");
      reply.header("Cache-Control", "public, max-age=60");
      return reply.type("image/svg+xml").send(placeholderSvg(photo.width, photo.height));
    },
  );
}
