import type { AlbumWithCover } from "../services/photos.js";
import { esc, mediaUrl } from "./util.js";

function albumCard(album: AlbumWithCover): string {
  const cover = album.cover;
  const thumbAttr = cover?.thumbhash ? ` data-thumbhash="${esc(cover.thumbhash)}"` : "";
  const img = cover
    ? `<img class="album-img photo-img absolute inset-0 w-full h-full object-cover"
           data-src="${mediaUrl(cover.id, "thumb")}" alt="${esc(album.name)} — featured photograph" />`
    : "";

  return `<a class="album group relative block w-full overflow-hidden bg-hairline"
          style="aspect-ratio:3/4" href="/albums/${esc(album.slug)}"
          aria-label="Open album ${esc(album.name)}">
    <div class="thumbhash absolute inset-0"${thumbAttr}></div>
    ${img}
    <div class="album-overlay absolute inset-0 bg-ink/55 flex items-center justify-center">
      <span class="font-serif italic text-paper text-[26px] sm:text-[30px] text-center px-4">${esc(album.name)}</span>
    </div>
  </a>`;
}

export function albumsPage(
  albums: AlbumWithCover[],
  yearRange: Readonly<{ oldest: number; newest: number }> | null,
): string {
  const grid = albums.length
    ? albums.map(albumCard).join("\n")
    : `<p class="font-mono text-[11px] label text-stone uppercase col-span-full">No albums yet.</p>`;

  const yearLabel = yearRange
    ? yearRange.oldest === yearRange.newest
      ? `Selected Work · ${yearRange.oldest}`
      : `Selected Work · ${yearRange.oldest}—${yearRange.newest}`
    : "Selected Work";

  return `<main id="albumsView">
  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-6">
    <p class="font-mono text-[10px] label text-stone uppercase">${yearLabel}</p>
    <h1 class="font-serif text-[34px] sm:text-[46px] leading-[1.05] mt-3 max-w-2xl">
      A quiet record of light, place, and the moments between.
    </h1>
  </section>

  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-24">
    <div id="albumGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      ${grid}
    </div>
  </section>
</main>`;
}
