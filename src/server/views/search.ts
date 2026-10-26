import type { SearchPhoto } from "../services/photos.js";
import {
  hasFilters,
  SEARCH_KEYS,
  type SearchFilters,
  searchHref,
} from "../services/search-filters.js";
import { icon } from "./icons.js";
import { lightbox, viewerDataScript } from "./photo-viewer.js";
import { esc, mediaUrl } from "./util.js";

/* Copy — owner's call; change freely. */
const FILTER_LABEL: Record<(typeof SEARCH_KEYS)[number], string> = {
  camera: "Camera",
  lens: "Lens",
};
const TITLE_NO_FILTER = "Search by gear";
const TITLE_NO_MATCH = "No photographs";
const COPY_NO_FILTER =
  "Choose a camera or a lens to see every photograph made with it, across all albums.";
const COPY_NO_MATCH = "Nothing matches this gear yet.";

/** Image `sizes` matching the 2 / 3 / 4 column grid (322 px tiles at the 1400 px cap). */
const TILE_SIZES =
  "(min-width: 1400px) 322px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

/**
 * Raw (unescaped) browser title; `layout()` escapes it. E.g.
 * `FE 24-70mm F2.8 GM II — Still`, `Sony A7 IV · FE 35mm — Still`, `Search — Still`.
 */
export function searchTitle(filters: SearchFilters): string {
  const values = SEARCH_KEYS.map((k) => filters[k]).filter((v): v is string => !!v);
  return values.length ? `${values.join(" · ")} — Still` : "Search — Still";
}

function headingText(count: number, filtered: boolean): string {
  if (!filtered) return TITLE_NO_FILTER;
  if (count === 0) return TITLE_NO_MATCH;
  return count === 1 ? "1 Photograph" : `${count} Photographs`;
}

function filterChips(filters: SearchFilters): string {
  const active = SEARCH_KEYS.filter((k) => filters[k]);
  const chips = active.map((key) => {
    const value = filters[key] ?? "";
    const label = FILTER_LABEL[key];
    return `<li class="max-w-full">
        <a href="${esc(searchHref({ ...filters, [key]: undefined }))}"
           aria-label="Remove filter ${label}: ${esc(value)}"
           class="group inline-flex items-center gap-2 max-w-full border border-hairline hover:border-ink px-3 py-1.5 font-mono transition-colors">
          <span class="text-[9px] label text-stone uppercase shrink-0">${label}</span>
          <span class="text-[12px] text-ink truncate">${esc(value)}</span>
          ${icon("x", { class: "w-3.5 h-3.5 shrink-0 text-stone group-hover:text-ink transition-colors" })}
        </a>
      </li>`;
  });
  if (active.length > 1) {
    chips.push(
      `<li><a href="/search" class="font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">Clear all</a></li>`,
    );
  }
  return `<ul aria-label="Active filters" class="flex flex-wrap items-center gap-2 mt-5">
      ${chips.join("\n      ")}
    </ul>`;
}

function emptyState(filtered: boolean): string {
  return `<p class="font-sans text-[14px] text-stone leading-relaxed mt-5 max-w-xl">${filtered ? COPY_NO_MATCH : COPY_NO_FILTER}</p>
    <a href="/gear" class="mt-6 inline-flex items-center gap-2 font-mono text-[11px] label text-stone hover:text-ink uppercase transition-colors">
      Browse my gear ${icon("arrow-right", { class: "w-3.5 h-3.5" })}
    </a>`;
}

/**
 * One square result tile. `.photo-row` sits on the button (the aspect-ratio
 * box), not the figure, so `content-visibility: auto` never needs an
 * intrinsic-size guess. No `data-admin-photo` / `data-year`: admin.ts and the
 * year rail must not pick these up.
 */
function resultTile(photo: SearchPhoto, index: number): string {
  const thumbAttr = photo.thumbhash ? ` data-thumbhash="${esc(photo.thumbhash)}"` : "";
  const alt = photo.title ? esc(photo.title) : "Photograph";
  return `<li>
        <figure id="photo-${esc(photo.id)}" class="flex flex-col">
          <button class="photo-row photo-tile relative block w-full aspect-square overflow-hidden bg-hairline"
                  data-viewer-open data-index="${index}"
                  aria-label="View ${alt} full screen">
            <div class="thumbhash absolute inset-0"${thumbAttr}></div>
            <img class="photo-img absolute inset-0 w-full h-full object-cover"
                 data-src="${mediaUrl(photo.id, "medium")}"
                 data-srcset="${mediaUrl(photo.id, "thumb")} 800w, ${mediaUrl(photo.id, "medium")} 1600w"
                 sizes="${TILE_SIZES}"
                 decoding="async" alt="${alt}" />
          </button>
          <figcaption class="mt-2 min-w-0">
            <a href="/albums/${esc(encodeURIComponent(photo.albumSlug))}"
               class="block truncate font-mono text-[9px] sm:text-[10px] label text-stone hover:text-ink uppercase transition-colors">
              <span class="sr-only">Album: </span>${esc(photo.albumName)}
            </a>
          </figcaption>
        </figure>
      </li>`;
}

/**
 * Gear search page body. `photos` order is the viewer order: tile
 * `data-index`, the `.photo-row` buttons and the `#viewer-data` island all
 * follow it. The lightbox and island are omitted when there are no results.
 */
export function searchPage(photos: SearchPhoto[], filters: SearchFilters): string {
  const filtered = hasFilters(filters);
  const count = filtered ? photos.length : 0;

  const results = count
    ? `<section aria-labelledby="searchTitle" class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-24">
    <ul id="searchGrid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-6 sm:gap-x-4 sm:gap-y-8">
      ${photos.map(resultTile).join("\n      ")}
    </ul>
  </section>`
    : "";

  const main = `<main id="searchView">
  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-8 sm:pb-10">
    <a href="/gear" class="inline-flex items-center gap-2 -ml-[16px] font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">
      ${icon("arrow-left", { class: "w-3.5 h-3.5" })} Gear
    </a>
    <h1 id="searchTitle" class="font-serif text-[32px] sm:text-[44px] leading-tight mt-5">${headingText(count, filtered)}</h1>
    ${filtered ? filterChips(filters) : ""}
    ${count ? "" : emptyState(filtered)}
  </section>
  ${results}
</main>`;

  return count ? `${main}\n\n${lightbox()}\n\n${viewerDataScript(photos)}` : main;
}
