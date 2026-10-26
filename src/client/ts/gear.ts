/**
 * My Gear page (admin only): the "In use" checkbox on each card marks the item
 * active/inactive and moves the card between "In the bag" and "Past
 * companions" without a reload. Inert for visitors (no checkboxes rendered).
 */

export type GearKind = "camera" | "lens";

/* ------------------------------------------------------------------ *
 *  Pure helpers (unit-tested)
 * ------------------------------------------------------------------ */

/** Section headings, mirrored from the server view's copy. */
const SECTION_NAME = { active: "In the bag", inactive: "Past companions" } as const;

/** The POST /admin/gear/active request for a toggle. */
export function toggleRequest(
  kind: GearKind,
  name: string,
  active: boolean,
): { url: string; init: RequestInit } {
  return {
    url: "/admin/gear/active",
    init: {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name, active }),
    },
  };
}

/** `data-gear-list` key of the list a card belongs in, e.g. `"active-lens"`. */
export function targetListKey(kind: GearKind, active: boolean): string {
  return `${active ? "active" : "inactive"}-${kind}`;
}

/** Live-region text announced after a move. */
export function moveMessage(name: string, active: boolean): string {
  return `${name} moved to ${active ? SECTION_NAME.active : SECTION_NAME.inactive}`;
}

/**
 * Where a card with `order` belongs among a list's existing `data-gear-order`
 * values: the first index holding a greater value, else the end.
 */
export function insertIndex(orders: number[], order: number): number {
  const i = orders.findIndex((o) => o > order);
  return i === -1 ? orders.length : i;
}

/* ------------------------------------------------------------------ *
 *  DOM wiring
 * ------------------------------------------------------------------ */

function isGearKind(v: string | undefined): v is GearKind {
  return v === "camera" || v === "lens";
}

/** Show the list's "None yet" placeholder only when it has no cards. */
function syncPlaceholder(list: Element | null): void {
  if (!list) return;
  const empty = list.querySelector<HTMLElement>("[data-gear-empty]");
  empty?.classList.toggle("hidden", list.querySelector("[data-gear-item]") !== null);
}

function moveCard(li: HTMLElement, target: HTMLElement): void {
  const order = Number(li.dataset.gearOrder);
  const siblings = Array.from(target.querySelectorAll<HTMLElement>(":scope > [data-gear-item]"));
  const idx = insertIndex(
    siblings.map((s) => Number(s.dataset.gearOrder)),
    order,
  );
  target.insertBefore(li, siblings[idx] ?? null);
}

export function initGear(): void {
  const view = document.getElementById("gearView");
  if (!view || !view.querySelector("[data-gear-toggle]")) return;
  const status = document.getElementById("gearStatus");

  view.addEventListener("change", async (e) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || !box.matches("[data-gear-toggle]")) return;
    const li = box.closest<HTMLElement>("[data-gear-item]");
    const kind = li?.dataset.gearKind;
    const name = li?.dataset.gearName;
    if (!li || !isGearKind(kind) || name === undefined) return;

    const active = box.checked;
    box.disabled = true;
    try {
      const { url, init } = toggleRequest(kind, name, active);
      const res = await fetch(url, init);
      if (res.status !== 204) {
        box.checked = !active;
        alert(`Update failed (${res.status})`);
        return;
      }
      const source = li.parentElement;
      const target = view.querySelector<HTMLElement>(
        `[data-gear-list="${targetListKey(kind, active)}"]`,
      );
      if (target && target !== source) {
        moveCard(li, target);
        syncPlaceholder(source);
        syncPlaceholder(target);
      }
      if (status) status.textContent = moveMessage(name, active);
    } catch {
      box.checked = !active;
      alert("Update failed — check your connection.");
    } finally {
      box.disabled = false;
      // Moving the node drops focus; restoring it also scrolls the card into view.
      box.focus();
    }
  });
}
