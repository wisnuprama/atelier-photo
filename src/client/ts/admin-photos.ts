/**
 * Admin photo table client logic: filter, pagination, inline edit with 15s
 * auto-save, and the CSV+images export/import round-trip.
 *
 * The page is rendered server-side (Phase 4); this module takes over the
 * pre-rendered `<tr data-row>` elements as a row pool and drives them from an
 * in-memory model built from the `#photos-data` JSON island. Edits live in the
 * model so they survive paging and filtering. The pure helpers (`filterRows`,
 * `paginate`, `dirtyRows`, and the state transitions) carry no DOM and are
 * unit-tested.
 */

import type { PhotoTableRow } from "../../server/services/photos.js";

const PAGE_SIZE = 50;
const AUTOSAVE_MS = 15_000;

export type RowState = "clean" | "dirty" | "saving" | "saved" | "error";

/** Whether a row is its album's cover: pinned, automatic, or not the cover. */
export type CoverState = "pinned" | "auto" | null;

/** Server response of `POST|DELETE /admin/photos/:id/cover`. */
export interface AlbumCoverResult {
  albumId: string;
  coverPhotoId: string | null;
  pinned: boolean;
}

/** Plain, DOM-free model for one photo row. */
export interface RowModel {
  id: string;
  albumSlug: string;
  albumName: string;
  title: string;
  commentary: string;
  /** Title is empty after trimming — shown inline, never flushed. */
  invalid: boolean;
  state: RowState;
  error: string | null;
  coverState: CoverState;
}

/* ------------------------------------------------------------------ *
 *  Pure helpers (unit-tested — no DOM)
 * ------------------------------------------------------------------ */

/** Build a fresh, clean model from a server row. */
export function toRowModel(row: PhotoTableRow): RowModel {
  return {
    id: row.id,
    albumSlug: row.albumSlug,
    albumName: row.albumName,
    title: row.title ?? "",
    commentary: row.commentary ?? "",
    invalid: false,
    state: "clean",
    error: null,
    coverState: row.coverState,
  };
}

/** Free-text filter across id / album / title / commentary (case-insensitive). */
export function filterRows(rows: RowModel[], query: string): RowModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.id, r.albumName, r.albumSlug, r.title, r.commentary].join("\0").toLowerCase().includes(q),
  );
}

export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
}

/** Slice `items` into a page of `size`; out-of-range pages clamp into bounds. */
export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const clamped = Math.min(Math.max(0, page), pageCount - 1);
  const start = clamped * size;
  return { items: items.slice(start, start + size), page: clamped, pageCount };
}

/**
 * Rows that should be flushed on the next auto-save tick: edited (or previously
 * failed) and not invalid. A failed save stays here so it is retried.
 */
export function dirtyRows(rows: RowModel[]): RowModel[] {
  return rows.filter((r) => (r.state === "dirty" || r.state === "error") && !r.invalid);
}

/** Apply an inline edit to a single field, updating validity + state. */
export function applyEdit(row: RowModel, field: "title" | "commentary", value: string): RowModel {
  row[field] = value;
  if (field === "title") {
    row.invalid = value.trim() === "";
    row.error = row.invalid ? "Title required" : null;
  }
  row.state = "dirty";
  return row;
}

export function markSaving(row: RowModel): RowModel {
  row.state = "saving";
  return row;
}

export function markSaved(row: RowModel): RowModel {
  row.state = "saved";
  row.error = null;
  return row;
}

/** Record a failed save; the row stays in the flush set and is retried. */
export function markError(row: RowModel, message: string): RowModel {
  row.state = "error";
  row.error = message;
  return row;
}

export interface CoverAction {
  /** Visible button text. */
  label: string;
  /**
   * Accessible name: starts with the visible `label` (WCAG 2.5.3 Label in
   * Name) and adds the album for context. The server view
   * (`coverControls`) renders the same string, HTML-escaped.
   */
  ariaLabel: string;
  method: "POST" | "DELETE";
}

/** Pure: visible label, accessible name and HTTP method for a row's cover button. */
export function coverAction(row: Pick<RowModel, "coverState" | "albumName">): CoverAction {
  const label = row.coverState === "pinned" ? "Reset to auto" : "Set as cover";
  return {
    label,
    ariaLabel: `${label}: ${row.albumName}`,
    method: row.coverState === "pinned" ? "DELETE" : "POST",
  };
}

/** Pure: the message announced (and shown by the button) when a cover request fails. */
export function coverFailureMessage(
  albumName: string,
  failure: { status: number; error?: string } | "network",
): string {
  const detail =
    failure === "network" ? "network error" : (failure.error ?? `HTTP ${failure.status}`);
  return `Cover failed for ${albumName}: ${detail}`;
}

/**
 * Pure: claim the per-album cover lock. Returns `false` (and changes nothing)
 * while another cover request for that album is in flight, so two rapid
 * toggles can't race and leave the UI out of step with the database.
 */
export function beginCoverRequest(inFlight: Set<string>, albumSlug: string): boolean {
  if (inFlight.has(albumSlug)) return false;
  inFlight.add(albumSlug);
  return true;
}

/** Pure: release the per-album cover lock taken by `beginCoverRequest`. */
export function endCoverRequest(inFlight: Set<string>, albumSlug: string): void {
  inFlight.delete(albumSlug);
}

/**
 * Pure: apply a server cover result to every row of that album. The effective
 * cover becomes `"pinned"` or `"auto"`; every other row of the album is cleared.
 * Rows of other albums are untouched.
 */
export function applyAlbumCover(
  rows: RowModel[],
  albumSlug: string,
  result: { coverPhotoId: string | null; pinned: boolean },
): RowModel[] {
  for (const r of rows) {
    if (r.albumSlug !== albumSlug) continue;
    r.coverState = r.id === result.coverPhotoId ? (result.pinned ? "pinned" : "auto") : null;
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 *  DOM wiring (covered by the manual checks, not unit tests)
 * ------------------------------------------------------------------ */

function readModels(island: HTMLElement): RowModel[] {
  if (!island.textContent) return [];
  try {
    return (JSON.parse(island.textContent) as PhotoTableRow[]).map(toRowModel);
  } catch {
    return [];
  }
}

/** One per-row outcome from `POST /admin/photos/import`. */
export interface ImportRowResult {
  id: string;
  status: string;
  message?: string;
}

/** Response body of `POST /admin/photos/import` (success or error). */
export interface ImportResponse {
  results?: ImportRowResult[];
  error?: string;
}

/**
 * One piece of the import summary: a bare text node, or an element with a
 * tag, optional class, and text content. Never HTML — the renderer assigns
 * `text` via `textContent`, so server strings cannot inject markup.
 */
export type SummaryPart =
  | string
  | { tag: "span" | "strong" | "div"; className?: string; text: string };

/** Describe the import summary for a response. `httpStatus` is used when the body has no error. */
export function importSummary(
  data: ImportResponse | null,
  ok: boolean,
  httpStatus: number,
): SummaryPart[] {
  if (!ok || !data?.results) {
    return [
      {
        tag: "span",
        className: "text-red-600",
        text: `Import failed: ${data?.error ?? `HTTP ${httpStatus}`}`,
      },
    ];
  }
  const counts = { updated: 0, not_found: 0, error: 0 } as Record<string, number>;
  for (const r of data.results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const failed = data.results.filter((r) => r.status !== "updated");
  return [
    { tag: "strong", text: `${counts.updated} updated` },
    ` · ${counts.not_found} not found · ${counts.error} error`,
    ...failed.map((r): SummaryPart => ({
      tag: "div",
      className: "text-stone mt-1",
      text: `${r.id}: ${r.status}${r.message ? ` — ${r.message}` : ""}`,
    })),
  ];
}

export function initAdminPhotos(): void {
  const island = document.getElementById("photos-data");
  if (!island) return;

  const tbody = document.getElementById("photos-tbody");
  const filterInput = document.getElementById("photos-filter") as HTMLInputElement | null;
  const statusEl = document.getElementById("photos-status");
  const pageEl = document.getElementById("photos-page");
  const prevBtn = document.getElementById("photos-prev") as HTMLButtonElement | null;
  const nextBtn = document.getElementById("photos-next") as HTMLButtonElement | null;
  const downloadBtn = document.getElementById("photos-download") as HTMLButtonElement | null;
  const uploadBtn = document.getElementById("photos-upload-btn") as HTMLButtonElement | null;
  const uploadInput = document.getElementById("photos-upload-input") as HTMLInputElement | null;
  const summaryEl = document.getElementById("photos-import-summary");
  if (!tbody || !filterInput || !statusEl || !pageEl || !prevBtn || !nextBtn) return;

  const models = readModels(island);
  const trById = new Map<string, HTMLTableRowElement>();
  for (const tr of tbody.querySelectorAll<HTMLTableRowElement>("[data-row]")) {
    const id = tr.dataset.photoId;
    if (id) trById.set(id, tr);
  }

  let page = 0;
  let lastSavedAt: number | null = null;

  const titleInput = (m: RowModel): HTMLInputElement | null =>
    trById.get(m.id)?.querySelector<HTMLInputElement>('[data-field="title"]') ?? null;
  const commentaryInput = (m: RowModel): HTMLTextAreaElement | null =>
    trById.get(m.id)?.querySelector<HTMLTextAreaElement>('[data-field="commentary"]') ?? null;

  function reflect(m: RowModel): void {
    const tr = trById.get(m.id);
    if (!tr) return;
    tr.dataset.state = m.state;
    const err = tr.querySelector<HTMLElement>("[data-error]");
    if (err) {
      const msg = m.invalid ? m.error : m.state === "error" ? m.error : null;
      err.textContent = msg ?? "";
      err.classList.toggle("hidden", !msg);
    }
  }

  /** Update the cover badge + button in place, so keyboard focus is kept. */
  function reflectCover(m: RowModel): void {
    const tr = trById.get(m.id);
    if (!tr) return;
    const badge = tr.querySelector<HTMLElement>("[data-cover-badge]");
    if (badge) {
      badge.textContent = m.coverState === "auto" ? "Cover · auto" : "Cover";
      badge.classList.toggle("hidden", m.coverState === null);
    }
    const btn = tr.querySelector<HTMLButtonElement>("[data-cover-action]");
    if (btn) {
      const { label, ariaLabel, method } = coverAction(m);
      btn.textContent = label;
      btn.dataset.coverMethod = method;
      btn.setAttribute("aria-label", ariaLabel);
    }
  }

  function pendingCount(): number {
    return models.filter((m) => m.state !== "clean" && m.state !== "saved").length;
  }

  function updateStatus(): void {
    const pending = pendingCount();
    const parts: string[] = [];
    if (lastSavedAt !== null) {
      const secs = Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000));
      parts.push(`Saved ${secs}s ago`);
    }
    if (pending) parts.push(`${pending} pending`);
    statusEl!.textContent = parts.length ? parts.join(" · ") : "All saved";
  }

  function render(): void {
    const filtered = filterRows(models, filterInput!.value);
    const { items, page: clamped, pageCount } = paginate(filtered, page, PAGE_SIZE);
    page = clamped;

    for (const tr of trById.values()) tr.style.display = "none";
    items.forEach((m) => {
      const tr = trById.get(m.id);
      if (!tr) return;
      tr.style.display = "";
      tbody!.appendChild(tr); // re-append in page order
      const num = tr.querySelector<HTMLElement>("[data-rownum]");
      if (num) num.textContent = String(filtered.indexOf(m) + 1);
      reflect(m);
    });

    pageEl!.textContent = `Page ${page + 1} / ${pageCount}`;
    prevBtn!.disabled = page <= 0;
    nextBtn!.disabled = page >= pageCount - 1;
    updateStatus();
  }

  async function saveRow(m: RowModel): Promise<void> {
    markSaving(m);
    reflect(m);
    const sentTitle = m.title;
    const sentCommentary = m.commentary;
    try {
      const res = await fetch(`/admin/photos/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title: m.title, commentary: m.commentary }),
      });
      // Don't clobber a newer edit the user made mid-flight.
      if (m.state !== "saving") return;
      if (res.ok) {
        const photo = (await res.json()) as { title: string | null; commentary: string | null };
        // Sync to the server's normalized (trimmed) values only if untouched.
        if (m.title === sentTitle) {
          m.title = photo.title ?? "";
          const el = titleInput(m);
          if (el) el.value = m.title;
        }
        if (m.commentary === sentCommentary) {
          m.commentary = photo.commentary ?? "";
          const el = commentaryInput(m);
          if (el) el.value = m.commentary;
        }
        markSaved(m);
        lastSavedAt = Date.now();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        markError(m, data.error ?? `Save failed (${res.status})`);
      }
    } catch {
      if (m.state === "saving") markError(m, "Network error");
    }
    reflect(m);
    updateStatus();
  }

  function flushDirty(): Promise<void[]> {
    return Promise.all(dirtyRows(models).map((m) => saveRow(m)));
  }

  // Flush a single row the moment its field loses focus (don't wait for the
  // 15s tick); no-op unless the row has a flushable edit (invalid rows skipped).
  function saveOnBlur(m: RowModel): void {
    if (dirtyRows([m]).length) void saveRow(m);
  }

  // --- inline edit wiring -------------------------------------------------
  for (const m of models) {
    const title = titleInput(m);
    title?.addEventListener("input", (e) => {
      applyEdit(m, "title", (e.target as HTMLInputElement).value);
      reflect(m);
      updateStatus();
    });
    title?.addEventListener("blur", () => saveOnBlur(m));

    const commentary = commentaryInput(m);
    commentary?.addEventListener("input", (e) => {
      applyEdit(m, "commentary", (e.target as HTMLTextAreaElement).value);
      reflect(m);
      updateStatus();
    });
    commentary?.addEventListener("blur", () => saveOnBlur(m));
  }

  // --- album cover --------------------------------------------------------
  // Cover results and failures are announced through `#photos-cover-status`;
  // failures are also shown in the row's `[data-cover-error]`. The cover path
  // never writes `[data-error]` — that span belongs to `reflect()`.
  const coverStatusEl = document.getElementById("photos-cover-status");
  const coverInFlight = new Set<string>();

  function announceCover(text: string): void {
    if (!coverStatusEl) return;
    // Clear first so a repeat of the same message is announced again.
    coverStatusEl.textContent = "";
    window.setTimeout(() => {
      coverStatusEl.textContent = text;
    }, 50);
  }

  function showCoverError(m: RowModel, text: string | null): void {
    const el = trById.get(m.id)?.querySelector<HTMLElement>("[data-cover-error]");
    if (!el) return;
    el.textContent = text ?? "";
    el.classList.toggle("hidden", !text);
  }

  /** Disable every cover button of an album while one of its requests is in flight. */
  function setAlbumCoverBusy(albumSlug: string, busy: boolean): void {
    for (const other of models) {
      if (other.albumSlug !== albumSlug) continue;
      const btn = trById.get(other.id)?.querySelector<HTMLButtonElement>("[data-cover-action]");
      if (btn) btn.disabled = busy;
    }
  }

  async function toggleCover(m: RowModel): Promise<void> {
    if (!beginCoverRequest(coverInFlight, m.albumSlug)) return;
    const { method } = coverAction(m);
    setAlbumCoverBusy(m.albumSlug, true);
    showCoverError(m, null);
    try {
      // No body and no Content-Type: Fastify rejects an empty JSON body.
      const res = await fetch(`/admin/photos/${encodeURIComponent(m.id)}/cover`, {
        method,
        credentials: "include",
      });
      if (res.ok) {
        const result = (await res.json()) as AlbumCoverResult;
        applyAlbumCover(models, m.albumSlug, result);
        for (const other of models) if (other.albumSlug === m.albumSlug) reflectCover(other);
        announceCover(
          result.pinned
            ? `Cover set for ${m.albumName}`
            : `Cover of ${m.albumName} reset to automatic`,
        );
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = coverFailureMessage(m.albumName, { status: res.status, error: data.error });
        showCoverError(m, msg);
        announceCover(msg);
      }
    } catch {
      const msg = coverFailureMessage(m.albumName, "network");
      showCoverError(m, msg);
      announceCover(msg);
    } finally {
      endCoverRequest(coverInFlight, m.albumSlug);
      setAlbumCoverBusy(m.albumSlug, false);
    }
  }

  for (const m of models) {
    const btn = trById.get(m.id)?.querySelector<HTMLButtonElement>("[data-cover-action]");
    btn?.addEventListener("click", () => void toggleCover(m));
  }

  // --- filter + pagination ------------------------------------------------
  filterInput.addEventListener("input", () => {
    page = 0;
    render();
  });
  prevBtn.addEventListener("click", () => {
    page -= 1;
    render();
  });
  nextBtn.addEventListener("click", () => {
    page += 1;
    render();
  });

  // --- auto-save ----------------------------------------------------------
  window.setInterval(() => {
    if (dirtyRows(models).length) void flushDirty();
    updateStatus();
  }, AUTOSAVE_MS);

  window.addEventListener("beforeunload", (e) => {
    const pending = dirtyRows(models);
    if (!pending.length) return;
    for (const m of pending) {
      fetch(`/admin/photos/${encodeURIComponent(m.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        keepalive: true,
        body: JSON.stringify({ title: m.title, commentary: m.commentary }),
      }).catch(() => {});
    }
    e.preventDefault();
    e.returnValue = "";
  });

  // --- download (flush first so the ZIP reflects saved data) --------------
  downloadBtn?.addEventListener("click", async () => {
    if (dirtyRows(models).length) await flushDirty();
    window.location.href = "/admin/photos/export";
  });

  // --- upload (CSV bulk import) -------------------------------------------
  function renderSummary(parts: SummaryPart[]): void {
    if (!summaryEl) return;
    summaryEl.replaceChildren(
      ...parts.map((p) => {
        if (typeof p === "string") return document.createTextNode(p);
        const el = document.createElement(p.tag);
        if (p.className) el.className = p.className;
        el.textContent = p.text;
        return el;
      }),
    );
    summaryEl.classList.remove("hidden");
  }

  /** Pull fresh saved values from the server and reset the affected models. */
  async function refreshFromServer(): Promise<void> {
    try {
      const res = await fetch("/admin/photos", { credentials: "include" });
      if (!res.ok) return;
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const fresh = doc.getElementById("photos-data");
      if (!fresh?.textContent) return;
      const byId = new Map<string, PhotoTableRow>();
      for (const row of JSON.parse(fresh.textContent) as PhotoTableRow[]) byId.set(row.id, row);
      for (const m of models) {
        const row = byId.get(m.id);
        if (!row) continue;
        m.title = row.title ?? "";
        m.commentary = row.commentary ?? "";
        m.invalid = false;
        m.state = "clean";
        m.error = null;
        m.coverState = row.coverState;
        reflectCover(m);
        const t = titleInput(m);
        if (t) t.value = m.title;
        const c = commentaryInput(m);
        if (c) c.value = m.commentary;
        reflect(m);
      }
      render();
    } catch {
      /* leave the table as-is on a refresh failure */
    }
  }

  uploadBtn?.addEventListener("click", () => uploadInput?.click());
  uploadInput?.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    try {
      const csv = await file.text();
      const res = await fetch("/admin/photos/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ csv }),
      });
      const data = (await res.json().catch(() => null)) as ImportResponse | null;
      uploadInput.value = "";
      renderSummary(importSummary(data, res.ok, res.status));
      if (res.ok && data?.results?.some((r) => r.status === "updated")) await refreshFromServer();
    } catch {
      uploadInput.value = "";
      renderSummary([
        {
          tag: "span",
          className: "text-red-600",
          text: "Import failed — could not read the file.",
        },
      ]);
    }
  });

  render();
}
