import type { GearItem, GearKind } from "../services/gear.js";
import { esc, mediaUrl } from "./util.js";

/* Copy — owner's call; change freely. */
const SECTION_TITLE = { active: "In the bag", inactive: "Past companions" } as const;
const KIND_TITLE: Record<GearKind, string> = { camera: "Cameras", lens: "Lenses" };
const INTRO =
  "The cameras and lenses behind the photographs — what I carry now, and what I have set down.";
const TOGGLE_LABEL = "In use";
const ADMIN_HINT = "Tick “In use” to keep an item in the bag";

type SectionKey = keyof typeof SECTION_TITLE;
const SECTIONS: readonly SectionKey[] = ["active", "inactive"];
const KINDS: readonly GearKind[] = ["camera", "lens"];

const LIST_CLASS =
  "mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10";

/**
 * Link from a gear card to the photos made with it (gear search). Keep the
 * name and signature stable: gear search rewrites the body to delegate to its
 * own `searchHref`.
 */
export function gearSearchHref(kind: GearKind, name: string): string {
  return `/search?${new URLSearchParams({ [kind]: name }).toString()}`;
}

/** A gear item paired with its index in the DAO list (re-insert order). */
export interface OrderedGear {
  item: GearItem;
  order: number;
}

export type GroupedGear = Record<SectionKey, Record<GearKind, OrderedGear[]>>;

/** Split the DAO list into active/inactive × camera/lens, keeping DAO order. */
export function groupGear(items: GearItem[]): GroupedGear {
  const groups: GroupedGear = {
    active: { camera: [], lens: [] },
    inactive: { camera: [], lens: [] },
  };
  items.forEach((item, order) => {
    groups[item.active ? "active" : "inactive"][item.kind].push({ item, order });
  });
  return groups;
}

export function formatPhotoCount(n: number): string {
  return n === 1 ? "1 photograph" : `${n} photographs`;
}

/** `2024—2026`, `2025` when equal, `""` when either end is unknown. */
export function formatYears(first: number | null, last: number | null): string {
  if (first === null || last === null) return "";
  return first === last ? String(first) : `${first}—${last}`;
}

/** Card meta line: count, plus ` · years` when the item is dated. */
export function gearMeta(item: GearItem): string {
  const years = formatYears(item.firstYear, item.lastYear);
  return years
    ? `${formatPhotoCount(item.photoCount)} · ${years}`
    : formatPhotoCount(item.photoCount);
}

/** Overall year span across all items for the eyebrow, or null when none is dated. */
export function gearYearSpan(items: GearItem[]): { first: number; last: number } | null {
  let first: number | null = null;
  let last: number | null = null;
  for (const i of items) {
    if (i.firstYear !== null && (first === null || i.firstYear < first)) first = i.firstYear;
    if (i.lastYear !== null && (last === null || i.lastYear > last)) last = i.lastYear;
  }
  return first !== null && last !== null ? { first, last } : null;
}

function gearCard({ item, order }: OrderedGear, isAdmin: boolean): string {
  const { kind, name, sample } = item;
  const thumbAttr = sample.thumbhash ? ` data-thumbhash="${esc(sample.thumbhash)}"` : "";
  const alt = sample.title?.trim() ? sample.title : "Sample photograph";
  const toggle = isAdmin
    ? `
    <label class="mt-2.5 inline-flex items-center gap-2 font-mono text-[10px] label text-stone uppercase cursor-pointer select-none transition-colors hover:text-ink">
      <input type="checkbox" data-gear-toggle${item.active ? " checked" : ""} class="accent-ink w-3.5 h-3.5 cursor-pointer disabled:cursor-wait" />
      <span>${TOGGLE_LABEL}<span class="sr-only"> — ${esc(name)}</span></span>
    </label>`
    : "";

  return `<li data-gear-item data-gear-kind="${kind}" data-gear-name="${esc(name)}" data-gear-order="${order}">
    <a class="gear-link group block" href="${esc(gearSearchHref(kind, name))}">
      <div class="relative aspect-square overflow-hidden bg-hairline">
        <div class="thumbhash absolute inset-0"${thumbAttr}></div>
        <img class="gear-img photo-img absolute inset-0 w-full h-full object-cover"
             data-src="${mediaUrl(sample.id, "thumb")}" width="${sample.width}" height="${sample.height}" decoding="async"
             alt="${esc(alt)}" />
      </div>
      <p class="font-serif italic text-[18px] sm:text-[20px] leading-[1.2] mt-3 text-balance">${esc(name)}</p>
      <p class="font-mono text-[10px] label text-stone uppercase mt-1.5 transition-colors group-hover:text-ink">${esc(gearMeta(item))}</p>
    </a>${toggle}
  </li>`;
}

function subGroup(
  section: SectionKey,
  kind: GearKind,
  cards: OrderedGear[],
  isAdmin: boolean,
): string {
  const titleId = `gear-${section}-${kind}-title`;
  const placeholder = isAdmin
    ? `<li data-gear-empty class="${cards.length ? "hidden " : ""}col-span-full font-mono text-[10px] label text-stone/60 uppercase">None yet</li>\n`
    : "";
  return `<div class="mt-8">
      <h3 id="${titleId}" class="font-mono text-[10px] label text-stone uppercase pb-3 border-b border-hairline">${KIND_TITLE[kind]}</h3>
      <ul aria-labelledby="${titleId}" data-gear-list="${section}-${kind}" class="${LIST_CLASS}">
        ${placeholder}${cards.map((c) => gearCard(c, isAdmin)).join("\n")}
      </ul>
    </div>`;
}

function gearSection(section: SectionKey, groups: GroupedGear, isAdmin: boolean): string {
  const byKind = groups[section];
  // Visitors never see empty sub-groups or sections; admins always get all four lists
  // so a toggled card always has somewhere to go.
  const kinds = isAdmin ? KINDS : KINDS.filter((k) => byKind[k].length > 0);
  if (!kinds.length) return "";
  const titleId = `gear-${section}-title`;
  return `<section aria-labelledby="${titleId}" data-gear-section="${section}">
    <h2 id="${titleId}" class="font-serif text-[26px] sm:text-[30px] leading-tight">${SECTION_TITLE[section]}</h2>
    ${kinds.map((k) => subGroup(section, k, byKind[k], isAdmin)).join("\n")}
  </section>`;
}

function adminStrip(withHint: boolean): string {
  const hint = withHint
    ? `<span id="gearStatus" aria-live="polite" class="font-mono text-[9px] label text-stone/60">${ADMIN_HINT}</span>
    <span class="font-mono text-[9px] label text-stone/40">·</span>`
    : "";
  return `<div class="max-w-[1400px] mx-auto px-5 sm:px-8 pb-4 flex flex-wrap items-center gap-3">
    <span class="font-mono text-[9px] label text-stone uppercase tracking-widest">Admin</span>
    <span class="font-mono text-[9px] label text-stone/40">·</span>
    ${hint}
    <a href="/admin/photos" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Manage photos</a>
    <span class="font-mono text-[9px] label text-stone/40 ml-auto">·</span>
    <form method="POST" action="/admin/logout" class="inline">
      <button type="submit" class="font-mono text-[9px] label text-stone hover:text-ink uppercase tracking-widest transition-colors">Sign out</button>
    </form>
  </div>`;
}

/** The public "My Gear" page body. Admins get the strip and per-card toggles. */
export function gearPage(items: GearItem[], isAdmin = false): string {
  const span = gearYearSpan(items);
  const eyebrow = span
    ? `Cameras &amp; Lenses · ${formatYears(span.first, span.last)}`
    : "Cameras &amp; Lenses";

  const hasItems = items.length > 0;
  let content: string;
  if (hasItems) {
    const groups = groupGear(items);
    content = SECTIONS.map((s) => gearSection(s, groups, isAdmin))
      .filter(Boolean)
      .join("\n");
  } else {
    const extra = isAdmin ? " Upload a photo with EXIF and it appears here." : "";
    content = `<p class="font-mono text-[11px] label text-stone uppercase">No gear yet.${extra}</p>`;
  }

  return `<main id="gearView">
  <section class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-6">
    <p class="font-mono text-[10px] label text-stone uppercase">${eyebrow}</p>
    <h1 class="font-serif text-[34px] sm:text-[46px] leading-[1.05] mt-3">My Gear</h1>
    <p class="font-serif italic text-[19px] sm:text-[22px] leading-snug text-stone mt-4 max-w-xl">${INTRO}</p>
  </section>
  ${isAdmin ? adminStrip(hasItems) : ""}

  <div class="max-w-[1400px] mx-auto px-5 sm:px-8 pt-6 sm:pt-8 pb-24 flex flex-col gap-14 sm:gap-20">
    ${content}
  </div>
</main>`;
}
