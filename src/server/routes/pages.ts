import type { FastifyInstance } from "fastify";
import { getAlbumBySlug, listAlbums, listPhotos } from "../services/photos.js";
import { albumsPage } from "../views/albums.js";
import { layout } from "../views/layout.js";
import { showcasePage } from "../views/showcase.js";
import { esc } from "../views/util.js";

export async function pageRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", async (_request, reply) => {
    const html = layout({
      title: "Atelier — Wisnu Photography",
      activeNav: "albums",
      body: albumsPage(listAlbums()),
    });
    return reply.type("text/html").send(html);
  });

  app.get<{ Params: { slug: string } }>("/albums/:slug", async (request, reply) => {
    const album = getAlbumBySlug(request.params.slug);
    if (!album) {
      const html = layout({
        title: "Not found — Atelier",
        body: `<main class="max-w-[1200px] mx-auto px-5 sm:px-8 py-24">
          <p class="font-mono text-[10px] label text-stone uppercase">404</p>
          <h1 class="font-serif text-[32px] mt-3">Album not found</h1>
          <p class="mt-4"><a class="font-mono text-[11px] label uppercase text-stone hover:text-ink" href="/">← Back to albums</a></p>
        </main>`,
      });
      return reply.code(404).type("text/html").send(html);
    }

    const photos = listPhotos(album.id);
    const html = layout({
      title: `${esc(album.name)} — Atelier`,
      body: showcasePage(album, photos),
    });
    return reply.type("text/html").send(html);
  });
}
