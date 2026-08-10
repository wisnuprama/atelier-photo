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

/** Centered overlay dialog for creating a new album (admin only). */
function albumCreateModal(): string {
  return `<div id="albumCreateModal" class="hidden fixed inset-0 z-[100]" role="dialog"
       aria-modal="true" aria-labelledby="albumCreateTitle" tabindex="-1">
  <div class="absolute inset-0 bg-ink/30" data-modal-close></div>
  <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,480px)] bg-paper border border-hairline p-8">
    <h2 id="albumCreateTitle" class="font-serif text-[24px]">New album</h2>
    <form id="albumCreateForm" class="mt-6 flex flex-col gap-4" novalidate>
      <label class="flex flex-col gap-1.5">
        <span class="font-mono text-[10px] label text-stone uppercase">Name</span>
        <input id="albumCreateName" name="name" type="text" required autocomplete="off"
               class="border border-hairline bg-paper px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-ink" />
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="font-mono text-[10px] label text-stone uppercase">Description · Optional</span>
        <textarea id="albumCreateDescription" name="description" rows="3"
               class="border border-hairline bg-paper px-3 py-2 font-mono text-[13px] resize-y focus:outline-none focus:border-ink"></textarea>
      </label>
      <p id="albumCreateError" class="hidden font-mono text-[9px] label text-red-600 uppercase" role="alert"></p>
      <div class="flex gap-3 justify-end mt-2">
        <button type="button" data-modal-close
                class="font-mono text-[11px] label uppercase border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors">Cancel</button>
        <button type="submit" id="albumCreateSubmit"
                class="font-mono text-[11px] label uppercase bg-ink text-paper px-5 py-2.5 hover:bg-stone transition-colors">Create</button>
      </div>
    </form>
  </div>
</div>`;
}

export function albumsPage(
  albums: AlbumWithCover[],
  yearRange: Readonly<{ oldest: number; newest: number }> | null,
  isAdmin = false,
): string {
  const grid = albums.length
    ? albums.map(albumCard).join("\n")
    : `<p class="font-mono text-[11px] label text-stone uppercase col-span-full">No albums yet.</p>`;

  const yearLabel = yearRange
    ? yearRange.oldest === yearRange.newest
      ? `Selected Work · ${yearRange.oldest}`
      : `Selected Work · ${yearRange.oldest}—${yearRange.newest}`
    : "Selected Work";

  const adminStrip = isAdmin
    ? `<div class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-4 flex items-center gap-3">
        <span class="font-mono text-[9px] label text-stone uppercase tracking-widest">Admin</span>
        <span class="font-mono text-[9px] label text-stone/40">·</span>
        <button type="button" data-album-create-open class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">New album</button>
        <span class="font-mono text-[9px] label text-stone/40">·</span>
        <a href="/admin/photos" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Manage photos</a>
        <span class="font-mono text-[9px] label text-stone/40 ml-auto">·</span>
        <form method="POST" action="/admin/logout" class="inline">
          <button type="submit" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Sign out</button>
        </form>
      </div>`
    : "";

  return `<main id="albumsView">
  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-6">
    <p class="font-mono text-[10px] label text-stone uppercase">${yearLabel}</p>
    <h1 class="font-serif text-[34px] sm:text-[46px] leading-[1.05] mt-3 max-w-2xl">
      A quiet record of light, place, and the moments between.
    </h1>
  </section>
  ${adminStrip}

  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-24">
    <div id="albumGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      ${grid}
    </div>
  </section>
</main>
${isAdmin ? albumCreateModal() : ""}`;
}
