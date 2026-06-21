/**
 * Showcase year rail: highlights the year currently in view as the user
 * scrolls, jumps to a year's first photo on click, and mirrors the active
 * year into the floating mobile chip.
 */
export function initShowcase(): void {
  const showcase = document.getElementById("showcaseView");
  if (!showcase) return;

  const railButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#yearRail [data-year-jump]"),
  );
  const chip = document.getElementById("yearChip");

  // First photo element for each year, newest first (matches rail order).
  const rows = Array.from(document.querySelectorAll<HTMLElement>(".photo-row"));
  const sections: Array<{ year: number; el: HTMLElement }> = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const year = Number(row.dataset.year);
    if (!year || seen.has(year)) continue;
    seen.add(year);
    sections.push({ year, el: row });
  }
  sections.sort((a, b) => b.year - a.year);
  if (sections.length === 0) return;

  function scrollToYear(year: number): void {
    const section = sections.find((s) => s.year === year);
    if (!section) return;
    const top = section.el.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top, behavior: "smooth" });
  }

  for (const btn of railButtons) {
    btn.addEventListener("click", () => scrollToYear(Number(btn.dataset.year)));
  }

  function update(): void {
    const mid = window.scrollY + window.innerHeight * 0.4;
    let active = sections[0]!.year;
    for (const s of sections) {
      if (s.el.offsetTop <= mid) active = s.year;
    }
    for (const btn of railButtons) {
      btn.dataset.active = Number(btn.dataset.year) === active ? "true" : "false";
    }
    if (chip) {
      chip.textContent = String(active);
      chip.classList.remove("hidden");
    }
  }

  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
}
