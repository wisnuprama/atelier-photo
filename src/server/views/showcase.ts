import type { AlbumWithCover, Photo } from "../services/photos.js";
import { icon } from "./icons.js";
import { esc, jsonScript, mediaUrl } from "./util.js";

function yearOf(photo: Photo): number {
  return photo.takenAt ? new Date(photo.takenAt).getUTCFullYear() : 0;
}

function displayDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Per-photo payload consumed by client viewer.ts (no extra fetch needed). */
function viewerData(photos: Photo[]) {
  return photos.map((p) => ({
    src: mediaUrl(p.id, "full"),
    title: p.title ?? "",
    commentary: p.commentary ?? "",
    date: displayDate(p.takenAt),
    filename: p.filename,
    camera: p.cameraBody ?? "",
    lens: p.lens ?? "",
    focal: p.focalLength ?? "",
    aperture: p.aperture ?? "",
    shutter: p.shutter ?? "",
    iso: p.iso ?? "",
  }));
}

function photoRow(photo: Photo, index: number): string {
  const thumbAttr = photo.thumbhash ? ` data-thumbhash="${esc(photo.thumbhash)}"` : "";
  const alt = photo.title ? esc(photo.title) : "Photograph";
  return `<figure class="photo-row" data-year="${yearOf(photo)}">
    <button class="block w-full overflow-hidden bg-hairline relative group touch-manipulation"
            style="aspect-ratio:${photo.width}/${photo.height}"
            data-viewer-open data-index="${index}"
            aria-label="View ${alt} full screen">
      <div class="thumbhash absolute inset-0"${thumbAttr}></div>
      <img class="photo-img absolute inset-0 w-full h-full object-cover"
           data-src="${mediaUrl(photo.id, "full")}" alt="${alt}" />
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

function lightbox(): string {
  return `<div id="lightbox" class="hidden fixed inset-0 z-50 bg-paper lightbox overscroll-none" role="dialog" aria-modal="true" aria-label="Photo viewer">
  <div class="flex h-full flex-row">
    <div id="imageStage" class="relative flex-1 flex items-center justify-center bg-paper min-h-0 touch-none px-3 sm:px-8 lg:px-10 pt-16 sm:pt-10 lg:pt-10 pb-24 sm:pb-20 lg:pb-20">
      <div id="imageFrame" class="relative w-full h-full">
        <img id="lightboxImgA" src="" alt="" class="absolute inset-0 w-full h-full object-contain" />
        <img id="lightboxImgB" src="" alt="" class="absolute inset-0 w-full h-full object-contain opacity-0" />
      </div>

      <div id="swipeHint" class="lg:hidden pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 bg-paper/85 backdrop-blur-sm px-5 py-4 rounded-2xl shadow-sm opacity-0 transition-opacity duration-500">
        ${icon("chevrons-up-down", { class: "w-6 h-6 text-ink swipe-bounce" })}
        <span class="font-mono text-[9px] label uppercase text-stone">Swipe to browse</span>
      </div>

      <div class="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 px-5 pt-8 pb-[max(14px,env(safe-area-inset-bottom))] bg-gradient-to-t from-paper via-paper/85 to-transparent">
        <button data-viewer-close class="p-1.5 text-ink/70 hover:text-ink transition-colors" aria-label="Close viewer">
          ${icon("x", { class: "w-6 h-6" })}
        </button>

        <div class="flex items-center gap-5">
          <button data-viewer-prev class="p-1.5 text-stone hover:text-ink transition-colors" aria-label="Previous photo">
            ${icon("chevron-up", { class: "w-6 h-6" })}
          </button>
          <span id="lightboxCount" class="font-mono text-[10px] label text-stone min-w-[58px] text-center"></span>
          <button data-viewer-next class="p-1.5 text-stone hover:text-ink transition-colors" aria-label="Next photo">
            ${icon("chevron-down", { class: "w-6 h-6" })}
          </button>
        </div>

        <button data-exif-toggle class="lg:hidden p-1.5 text-ink/70 hover:text-ink transition-colors" aria-label="Show photo info">
          ${icon("info", { class: "w-[22px] h-[22px]" })}
        </button>
        <span class="hidden lg:block w-9" aria-hidden="true"></span>
      </div>
    </div>

    <div id="exifScrim" class="lg:hidden hidden fixed inset-0 z-30 bg-ink/30" data-exif-toggle></div>

    <aside id="exifPanel" class="exif-scroll
        absolute inset-x-0 bottom-0 max-h-[78%] translate-y-full rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)]
        lg:static lg:translate-y-0 lg:max-h-none lg:w-[340px] lg:shrink-0 lg:rounded-none lg:shadow-none
        border-t lg:border-t-0 lg:border-l border-hairline bg-paper overflow-y-auto
        p-6 sm:p-8 transition-transform duration-300 ease-out z-40">

      <div class="flex items-center justify-between mb-5 lg:hidden">
        <span class="font-mono text-[9px] label text-stone uppercase">Photo Info</span>
        <button data-exif-toggle class="p-1 text-stone hover:text-ink transition-colors" aria-label="Hide info">
          ${icon("chevron-down", { class: "w-5 h-5" })}
        </button>
      </div>

      <h3 id="exifTitle" class="font-serif text-[24px] leading-tight"></h3>
      <p id="exifDate" class="font-mono text-[10px] label text-stone uppercase mt-2"></p>
      <p id="exifNote" class="font-sans text-[13.5px] text-stone leading-relaxed mt-6 italic"></p>

      <div class="mt-8 pt-6 border-t border-hairline">
        <p class="font-mono text-[9px] label text-stone uppercase mb-4">Capture Data</p>
        <dl id="exifList" class="flex flex-col gap-0"></dl>
      </div>
    </aside>
  </div>
</div>`;
}

export function showcasePage(album: AlbumWithCover, photos: Photo[]): string {
  const stream = photos.length
    ? photos.map((p, i) => photoRow(p, i)).join("\n")
    : `<p class="font-mono text-[11px] label text-stone uppercase px-3">No photos in this album yet.</p>`;

  const desc = album.description
    ? `<p id="showcaseDesc" class="font-sans text-[14px] text-stone leading-relaxed mt-5 max-w-xl">${esc(album.description)}</p>`
    : "";

  return `<main id="showcaseView">
  <section class="max-w-[1200px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-8 sm:pb-10">
    <a href="/" class="inline-flex items-center gap-2 -ml-[16px] font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">
      ${icon("arrow-left", { class: "w-3.5 h-3.5" })} Albums
    </a>
    <h2 id="showcaseTitle" class="font-serif text-[32px] sm:text-[44px] leading-tight mt-5">${esc(album.name)}</h2>
    <p id="showcaseMeta" class="font-mono text-[10px] label text-stone uppercase mt-3">${album.photoCount} Photographs</p>
    ${desc}
  </section>

  <div class="max-w-[1200px] mx-auto px-2 sm:px-4 pb-32 relative">
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

<script type="application/json" id="viewer-data">${jsonScript(viewerData(photos))}</script>`;
}
