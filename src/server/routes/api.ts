import type { FastifyInstance } from "fastify";
import { getAlbumBySlug, listAlbums, listPhotos } from "../services/photos.js";

/**
 * JSON API — a thin read layer for progressive enhancement / external clients.
 * Mounted under /api.
 */
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  // The iOS Shortcut reads this to pick a target album slug.
  app.get("/albums", async () => ({
    albums: listAlbums().map((a) => ({ id: a.id, slug: a.slug, name: a.name })),
  }));

  app.get<{ Params: { slug: string } }>("/albums/:slug", async (request, reply) => {
    const album = getAlbumBySlug(request.params.slug);
    if (!album) {
      return reply.code(404).send({ error: "album not found" });
    }
    return { album, photos: listPhotos(album.id) };
  });
}
