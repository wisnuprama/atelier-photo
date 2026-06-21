/** Mobile hamburger menu toggle + hairline divider that appears on scroll. */
export function initNav(): void {
  const nav = document.getElementById("nav");
  const toggle = document.querySelector<HTMLButtonElement>("[data-nav-toggle]");
  const menu = document.getElementById("mobileMenu");

  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("hidden") === false;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  }

  if (nav) {
    const onScroll = (): void => {
      nav.classList.toggle("border-hairline", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }
}
