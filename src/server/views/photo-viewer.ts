import type { Photo } from "../services/photos.js";
import { icon } from "./icons.js";
import { jsonScript, mediaUrl } from "./util.js";

/*
 * Full-screen photo viewer markup shared by the album page (views/showcase.ts)
 * and gear search (views/search.ts). Client `viewer.ts` reads `#viewer-data`,
 * wires `[data-viewer-open][data-index]`, and on close scrolls to
 * `.photo-row` number `index` — so the JSON order, the `data-index` values and
 * the `.photo-row` elements must line up.
 */

export function displayDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Per-photo payload consumed by client viewer.ts (no extra fetch needed). */
export function viewerData(photos: Photo[]) {
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

/** The `<script type="application/json" id="viewer-data">` island for `viewerData(photos)`. */
export function viewerDataScript(photos: Photo[]): string {
  return `<script type="application/json" id="viewer-data">${jsonScript(viewerData(photos))}</script>`;
}

/** The full-screen viewer dialog (lightbox + EXIF panel); opened by client viewer.ts. */
export function lightbox(): string {
  return `<div id="lightbox" class="hidden fixed inset-0 z-50 bg-paper lightbox overscroll-none" role="dialog" aria-modal="true" aria-label="Photo viewer">
  <div class="flex h-full flex-row">
    <div id="imageStage" class="relative flex-1 flex items-center justify-center bg-paper min-h-0 touch-none overflow-hidden px-3 sm:px-8 lg:px-10 pt-16 sm:pt-10 lg:pt-10 pb-24 sm:pb-20 lg:pb-20">
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
