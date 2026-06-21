import type { FastifyInstance } from "fastify";
import { getAlbum, listAlbums, listPhotos } from "../services/photos.js";

/**
 * JSON API — a thin read layer for progressive enhancement / external clients.
 * Mounted under /api.
 */
export async function apiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/albums", async () => ({ albums: listAlbums() }));

  app.get<{ Params: { id: string } }>("/albums/:id", async (request, reply) => {
    const album = getAlbum(request.params.id);
    if (!album) {
      return reply.code(404).send({ error: "album not found" });
    }
    return { album, photos: listPhotos(album.id) };
  });
}
