import type { AlbumWithCover, Photo } from "../services/photos.js";
import { icon } from "./icons.js";
import { lightbox, viewerDataScript } from "./photo-viewer.js";
import { esc, mediaUrl } from "./util.js";

function yearOf(photo: Photo): number {
  return photo.takenAt ? new Date(photo.takenAt).getUTCFullYear() : 0;
}

function photoRow(photo: Photo, index: number, isAdmin: boolean): string {
  const thumbAttr = photo.thumbhash ? ` data-thumbhash="${esc(photo.thumbhash)}"` : "";
  const alt = photo.title ? esc(photo.title) : "Photograph";
  const adminAttrs = isAdmin
    ? ` data-admin-photo data-photo-id="${esc(photo.id)}" class="photo-row select-none" data-year="${yearOf(photo)}"`
    : ` class="photo-row" data-year="${yearOf(photo)}"`;
  // Tall portraits would otherwise exceed the viewport (you can't see the whole
  // photo at once). Cap their height to a fraction of the viewport and let the
  // aspect-ratio derive the width; landscapes are short enough to never hit it.
  // dvh tracks mobile browser chrome; max-width + mx-auto keep it centered.
  const portraitCap =
    photo.height > photo.width ? ` max-width:calc(85dvh * ${photo.width} / ${photo.height});` : "";
  return `<figure id="photo-${esc(photo.id)}"${adminAttrs}>
    <button class="block w-full mx-auto overflow-hidden bg-hairline relative group"
            style="aspect-ratio:${photo.width}/${photo.height};${portraitCap}"
            data-viewer-open data-index="${index}"
            aria-label="View ${alt} full screen">
      <div class="thumbhash absolute inset-0"${thumbAttr}></div>
      <img class="photo-img absolute inset-0 w-full h-full object-cover"
           data-src="${mediaUrl(photo.id, "medium")}"
           data-srcset="${mediaUrl(photo.id, "thumb")} 800w, ${mediaUrl(photo.id, "medium")} 1600w"
           sizes="(min-width: 1280px) 900px, (min-width: 1024px) 780px, 100vw"
           decoding="async" alt="${alt}" />
    </button>
  </figure>`;
}

function yearRail(photos: Photo[]): string {
  const years = [...new Set(photos.map(yearOf))].filter((y) => y > 0).toSorted((a, b) => b - a);
  return years
    .map(
      (y) => `<button class="year-btn flex items-center gap-3 justify-end text-stone hover:text-ink"
        data-year="${y}" data-year-jump>
        <span class="font-mono text-[11px]">${y}</span>
        <span class="tick block h-px w-3 bg-stone"></span>
      </button>`,
    )
    .join("");
}

/** Centered overlay dialog for uploading photos into `album` (admin only). */
function uploadModal(album: AlbumWithCover): string {
  return `<div id="uploadModal" data-album-slug="${esc(album.slug)}" class="hidden fixed inset-0 z-[100]"
       role="dialog" aria-modal="true" aria-labelledby="uploadTitle" tabindex="-1">
  <div class="absolute inset-0 bg-ink/30" data-modal-close></div>
  <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,560px)] max-h-[85dvh] overflow-y-auto bg-paper border border-hairline p-8">
    <h2 id="uploadTitle" class="font-serif text-[24px]">Upload photos</h2>
    <p class="font-mono text-[10px] label text-stone uppercase mt-1.5">${esc(album.name)}</p>
    <div id="uploadDropzone" role="button" tabindex="0" aria-label="Choose photos to upload"
         class="mt-6 border border-dashed border-stone/50 px-6 py-10 text-center cursor-pointer transition-colors">
      ${icon("upload", { size: 20, class: "inline-block text-stone" })}
      <p class="font-mono text-[10px] label text-stone uppercase mt-3">Drag photos here or click to browse</p>
      <p class="font-mono text-[9px] label text-stone/60 uppercase mt-2">Multiple files · JPEG PNG WEBP AVIF TIFF GIF · 60 MB max</p>
      <input id="uploadInput" type="file" multiple class="sr-only"
             accept="image/jpeg,image/png,image/webp,image/avif,image/tiff,image/gif" />
    </div>
    <ul id="uploadList" class="mt-5 flex flex-col" aria-live="polite"></ul>
    <div class="flex items-center justify-between mt-6">
      <span id="uploadCounter" class="font-mono text-[9px] label text-stone uppercase"></span>
      <button type="button" id="uploadDone" data-modal-close
              class="font-mono text-[11px] label uppercase bg-ink text-paper px-5 py-2.5 hover:bg-stone transition-colors disabled:bg-hairline disabled:text-stone disabled:cursor-not-allowed">Done</button>
    </div>
  </div>
</div>`;
}

export function showcasePage(album: AlbumWithCover, photos: Photo[], isAdmin = false): string {
  const stream = photos.length
    ? photos.map((p, i) => photoRow(p, i, isAdmin)).join("\n")
    : `<p class="font-mono text-[11px] label text-stone uppercase px-3">No photos in this album yet.</p>`;

  const desc = album.description
    ? `<p id="showcaseDesc" class="font-sans text-[14px] text-stone leading-relaxed mt-5 max-w-xl">${esc(album.description)}</p>`
    : "";

  const adminStrip = isAdmin
    ? `<div class="max-w-[1200px] mx-auto px-5 sm:px-8 pb-2 flex items-center gap-3">
        <span class="font-mono text-[9px] label text-stone uppercase tracking-widest">Admin</span>
        <span class="font-mono text-[9px] label text-stone/40">·</span>
        <span class="font-mono text-[9px] label text-stone/60">Long-press photo to manage</span>
        <span data-admin-status role="status" aria-live="polite" class="font-mono text-[9px] label text-ink uppercase tracking-widest"></span>
        <span class="font-mono text-[9px] label text-stone/40">·</span>
        <button type="button" data-upload-open class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Upload photos</button>
        <span class="font-mono text-[9px] label text-stone/40">·</span>
        <a href="/admin/photos" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Manage photos</a>
        <span class="font-mono text-[9px] label text-stone/40 ml-auto">·</span>
        <form method="POST" action="/admin/logout" class="inline">
          <button type="submit" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Sign out</button>
        </form>
      </div>`
    : "";

  return `<main id="showcaseView">
  <section class="lg:max-w-[780px] xl:max-w-[900px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-8 sm:pb-10">
    <a href="/" class="inline-flex items-center gap-2 -ml-[16px] font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">
      ${icon("arrow-left", { class: "w-3.5 h-3.5" })} Albums
    </a>
    <h2 id="showcaseTitle" class="font-serif text-[32px] sm:text-[44px] leading-tight mt-5">${esc(album.name)}</h2>
    <p id="showcaseMeta" class="font-mono text-[10px] label text-stone uppercase mt-3">${album.photoCount} Photographs</p>
    ${desc}
  </section>
  ${adminStrip}

  <div class="lg:max-w-[780px] xl:max-w-[900px] mx-auto px-2 sm:px-4 pb-32 relative">
    <div id="photoStream" class="flex flex-col gap-3 sm:gap-5">
      ${stream}
    </div>

    <aside id="yearRail" class="hidden lg:flex flex-col gap-3 fixed right-8 top-1/2 -translate-y-1/2 z-30">
      ${yearRail(photos)}
    </aside>
  </div>

  <div id="yearChip" class="lg:hidden hidden fixed right-4 bottom-6 z-30 bg-ink text-paper font-mono text-[11px] px-3 py-1.5 rounded-full shadow-lg"></div>
</main>

${lightbox()}
${isAdmin ? uploadModal(album) : ""}

${viewerDataScript(photos)}`;
}
