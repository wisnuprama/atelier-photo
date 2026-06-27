function buildMenu(): HTMLElement {
  const div = document.createElement("div");
  div.id = "adminPhotoMenu";
  div.className =
    "hidden fixed z-[200] bg-paper border border-hairline shadow-lg rounded-lg py-1 min-w-[180px]";
  div.setAttribute("role", "menu");
  div.innerHTML = `<button data-menu-delete role="menuitem"
    class="w-full text-left px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-red-600 hover:bg-stone/5 transition-colors">
    Delete photo
  </button>`;
  return div;
}

export function initAdmin(): void {
  const figures = Array.from(document.querySelectorAll<HTMLElement>("[data-admin-photo]"));
  if (figures.length === 0) return;

  const menu = buildMenu();
  document.body.appendChild(menu);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let longPressActive = false;
  let currentPhotoId: string | null = null;
  let startX = 0;
  let startY = 0;

  function openMenu(photoId: string, x: number, y: number): void {
    longPressActive = true;
    currentPhotoId = photoId;
    const menuW = 188;
    const menuH = 52;
    const left = Math.min(x + 4, window.innerWidth - menuW - 8);
    const top = Math.min(y + 4, window.innerHeight - menuH - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.classList.remove("hidden");
  }

  function closeMenu(): void {
    menu.classList.add("hidden");
    currentPhotoId = null;
  }

  function cancelTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  // Suppress the click event that follows a long press so the viewer doesn't open.
  document.addEventListener(
    "click",
    (e) => {
      if (longPressActive) {
        e.stopPropagation();
        e.preventDefault();
        longPressActive = false;
      }
    },
    { capture: true },
  );

  // Close menu when clicking outside it.
  document.addEventListener("pointerdown", (e) => {
    if (!menu.classList.contains("hidden") && !menu.contains(e.target as Node)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  for (const fig of figures) {
    fig.addEventListener("pointerdown", (e) => {
      const photoId = fig.dataset.photoId ?? null;
      if (!photoId) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        openMenu(photoId, e.clientX, e.clientY);
      }, 600);
    });

    fig.addEventListener("pointermove", (e) => {
      if (
        timer !== null &&
        (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)
      ) {
        cancelTimer();
      }
    });

    fig.addEventListener("pointerup", cancelTimer);
    fig.addEventListener("pointercancel", cancelTimer);

    // Desktop right-click opens the menu immediately.
    fig.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      cancelTimer();
      const photoId = fig.dataset.photoId ?? null;
      if (photoId) openMenu(photoId, e.clientX, e.clientY);
    });
  }

  menu.querySelector("[data-menu-delete]")?.addEventListener("click", async () => {
    const photoId = currentPhotoId;
    closeMenu();
    if (!photoId) return;

    if (!confirm("Delete this photo? This cannot be undone.")) return;

    try {
      const res = await fetch(`/admin/photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.status === 204) {
        const fig = document.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(photoId)}"]`);
        if (fig) {
          fig
            .animate([{ opacity: 1 }, { opacity: 0 }], {
              duration: 250,
              easing: "ease-out",
              fill: "forwards",
            })
            .addEventListener("finish", () => fig.remove());
        }
      } else {
        alert(`Delete failed (${res.status})`);
      }
    } catch {
      alert("Delete failed — check your connection.");
    }
  });
}
