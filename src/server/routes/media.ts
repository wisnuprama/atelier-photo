import { createReadStream, existsSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { DERIVATIVE_NAMES, derivativePath } from "../services/derivatives.js";
import { getPhoto } from "../services/photos.js";

/**
 * Generated grey placeholder frame, sized to the photo's real aspect ratio.
 * Used until the sharp derivative pipeline lands; keeps layout stable (no CLS).
 */
function placeholderSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#e6e6e6"/>
    <rect x="1%" y="1%" width="98%" height="98%" fill="none" stroke="#d4d4d4" stroke-width="2"/>
  </svg>`;
}

export async function mediaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { photoId: string; variant: string } }>(
    "/media/:photoId/:variant",
    async (request, reply) => {
      const { photoId, variant } = request.params;
      if (!DERIVATIVE_NAMES.has(variant)) {
        return reply.code(404).send({ error: "unknown variant" });
      }

      const photo = getPhoto(photoId);
      if (!photo) {
        return reply.code(404).send({ error: "photo not found" });
      }

      const file = derivativePath(photoId, variant);
      if (existsSync(file)) {
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
        return reply.type("image/webp").send(createReadStream(file));
      }

      // No derivative yet (ingest pipeline is stubbed): serve a sized placeholder.
      reply.header("Cache-Control", "public, max-age=60");
      return reply.type("image/svg+xml").send(placeholderSvg(photo.width, photo.height));
    },
  );
}
