import type { PhotoTableRow } from "../services/photos.js";
import { icon } from "./icons.js";
import { layout } from "./layout.js";
import { esc, jsonScript, mediaUrl } from "./util.js";

/** Compact, read-only EXIF line: "f/1.8 · 1/250s · ISO 100 · 35mm". */
function exifSummary(row: PhotoTableRow): string {
  const parts = [
    row.aperture,
    row.shutter,
    row.iso ? `ISO ${row.iso}` : null,
    row.focalLength,
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
  return parts.join(" · ");
}

/** Mobile-only field label; the desktop <thead> carries the column names. */
function mobileLabel(text: string): string {
  return `<span class="sm:hidden font-mono text-[9px] label text-stone uppercase tracking-widest mb-1 block">${text}</span>`;
}

/** A single photo row — a real table row on >=sm, a stacked card on mobile. */
function tableRow(row: PhotoTableRow, index: number): string {
  const albumHref = `/albums/${encodeURIComponent(row.albumSlug)}`;
  const photoHref = `${albumHref}#photo-${encodeURIComponent(row.id)}`;
  const exif = exifSummary(row);

  return `<tr data-row data-photo-id="${esc(row.id)}"
      class="block sm:table-row border-b border-hairline py-4 sm:py-0 align-top">
    <td data-cell="num"
        class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle font-mono text-[11px] text-stone tabular-nums">
      ${mobileLabel("#")}<span data-rownum>${index + 1}</span>
    </td>
    <td data-cell="id" class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle">
      ${mobileLabel("ID")}
      <a href="${esc(photoHref)}" target="_blank" rel="noopener noreferrer"
         class="font-mono text-[11px] text-stone hover:text-ink underline decoration-hairline underline-offset-2 transition-colors">
        ${esc(row.id)}
      </a>
      <span class="block font-mono text-[10px] text-stone/70 mt-1">${esc(row.filename)}</span>
    </td>
    <td data-cell="image" class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle">
      ${mobileLabel("Image")}
      <a href="${esc(photoHref)}" target="_blank" rel="noopener noreferrer"
         aria-label="Open photo ${esc(row.id)} in viewer"
         class="inline-block focus:outline-none focus:ring-2 focus:ring-ink">
        <img src="${mediaUrl(row.id, "thumb")}" loading="lazy" decoding="async"
             alt="${row.title ? esc(row.title) : "Photograph"}"
             class="w-20 h-20 object-cover bg-hairline hover:opacity-90 transition-opacity cursor-pointer" />
      </a>
    </td>
    <td data-cell="album" class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle">
      ${mobileLabel("Album")}
      <a href="${esc(albumHref)}" target="_blank" rel="noopener noreferrer"
         class="font-sans text-[12px] text-stone hover:text-ink underline decoration-hairline underline-offset-2 transition-colors">
        ${esc(row.albumName)}
      </a>
    </td>
    <td data-cell="title" class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle">
      ${mobileLabel("Title")}
      <input type="text" data-field="title" value="${esc(row.title)}"
             aria-label="Title for photo ${esc(row.id)}"
             class="w-full sm:min-w-[12rem] border border-hairline bg-paper px-2 py-1.5 font-sans text-[13px] focus:outline-none focus:border-ink" />
      <span data-error class="hidden font-mono text-[9px] label text-red-600 uppercase mt-1 block"></span>
    </td>
    <td data-cell="commentary" class="block sm:table-cell sm:py-3 sm:pr-3 sm:align-middle">
      ${mobileLabel("Commentary")}
      <textarea data-field="commentary" rows="2"
                aria-label="Commentary for photo ${esc(row.id)}"
                class="w-full sm:min-w-[14rem] border border-hairline bg-paper px-2 py-1.5 font-sans text-[13px] leading-relaxed resize-y focus:outline-none focus:border-ink">${esc(row.commentary)}</textarea>
    </td>
    <td data-cell="exif" class="block sm:table-cell sm:py-3 sm:align-middle">
      ${mobileLabel("EXIF")}
      <span class="font-mono text-[10px] text-stone leading-relaxed">${esc(exif)}</span>
    </td>
  </tr>`;
}

function headerCell(label: string): string {
  return `<th scope="col" class="text-left font-mono text-[9px] label text-stone uppercase tracking-widest py-3 pr-3">${label}</th>`;
}

export function adminPhotosPage(rows: PhotoTableRow[]): string {
  const body = rows.length
    ? rows.map((row, i) => tableRow(row, i)).join("\n")
    : `<tr data-empty><td colspan="7" class="block sm:table-cell py-12 text-center font-mono text-[11px] label text-stone uppercase">No photos yet</td></tr>`;

  return layout({
    title: "Admin · Photos",
    body: `<main class="max-w-[1400px] mx-auto px-5 sm:px-8 py-10 sm:py-12">
  <div class="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
    <div class="flex-1">
      <a href="/" class="inline-flex items-center gap-2 -ml-[16px] font-mono text-[10px] label text-stone hover:text-ink uppercase transition-colors">
        ${icon("arrow-left", { class: "w-3.5 h-3.5" })} Back
      </a>
      <h1 class="font-serif text-[28px] sm:text-[32px] leading-tight mt-3">Admin · Photos</h1>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex-1 sm:flex-none">
        <span class="sr-only">Filter photos</span>
        <input type="search" id="photos-filter" placeholder="Filter…"
               class="w-full sm:w-56 border border-hairline bg-paper px-3 py-2 font-mono text-[12px] focus:outline-none focus:border-ink" />
      </label>
      <button type="button" id="photos-download"
              class="font-mono text-[11px] label uppercase border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors">
        Download
      </button>
      <button type="button" id="photos-upload-btn"
              class="font-mono text-[11px] label uppercase border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors">
        Upload
      </button>
      <input type="file" id="photos-upload-input" accept=".csv,text/csv" class="hidden" />
      <form method="POST" action="/admin/logout" class="inline">
        <button type="submit"
                class="font-mono text-[11px] label uppercase text-stone hover:text-ink transition-colors">
          Sign out
        </button>
      </form>
    </div>
  </div>

  <div id="photos-import-summary" class="hidden mt-6 border border-hairline bg-paper p-4 font-mono text-[11px] text-stone"></div>

  <div class="mt-8 overflow-x-auto">
    <table class="w-full border-collapse">
      <thead class="hidden sm:table-header-group border-b border-ink">
        <tr>
          ${headerCell("#")}
          ${headerCell("ID")}
          ${headerCell("Image")}
          ${headerCell("Album")}
          ${headerCell("Title")}
          ${headerCell("Commentary")}
          ${headerCell("EXIF")}
        </tr>
      </thead>
      <tbody id="photos-tbody">
        ${body}
      </tbody>
    </table>
  </div>

  <div class="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <p id="photos-status" class="font-mono text-[10px] label text-stone uppercase tracking-widest" aria-live="polite"></p>
    <div id="photos-pagination" class="flex items-center gap-4">
      <button type="button" id="photos-prev"
              class="font-mono text-[10px] label uppercase text-stone hover:text-ink disabled:opacity-30 disabled:hover:text-stone transition-colors">
        ← Prev
      </button>
      <span id="photos-page" class="font-mono text-[10px] label text-stone uppercase tabular-nums"></span>
      <button type="button" id="photos-next"
              class="font-mono text-[10px] label uppercase text-stone hover:text-ink disabled:opacity-30 disabled:hover:text-stone transition-colors">
        Next →
      </button>
    </div>
  </div>
</main>

<script type="application/json" id="photos-data">${jsonScript(rows)}</script>`,
  });
}
