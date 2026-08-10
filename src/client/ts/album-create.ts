import { createModal } from "./modal.js";

/** Wire the admin "New album" modal on the album list page. */
export function initAlbumCreate(): void {
  const root = document.getElementById("albumCreateModal");
  if (!root) return;

  const modal = createModal(root);
  const form = document.getElementById("albumCreateForm") as HTMLFormElement | null;
  const nameInput = document.getElementById("albumCreateName") as HTMLInputElement | null;
  const descInput = document.getElementById("albumCreateDescription") as HTMLTextAreaElement | null;
  const errorLine = document.getElementById("albumCreateError");
  const submitBtn = document.getElementById("albumCreateSubmit") as HTMLButtonElement | null;
  if (!form || !nameInput || !errorLine) return;

  function showError(message: string): void {
    errorLine!.textContent = message;
    errorLine!.classList.remove("hidden");
  }

  for (const btn of document.querySelectorAll<HTMLElement>("[data-album-create-open]")) {
    btn.addEventListener("click", () => {
      modal.open();
      nameInput.focus();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorLine.classList.add("hidden");

    const name = nameInput.value.trim();
    if (!name) {
      showError("Name is required");
      nameInput.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch("/admin/albums/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: descInput?.value.trim() || undefined }),
      });
      if (res.status === 201) {
        const { slug } = (await res.json()) as { slug: string };
        location.href = `/albums/${encodeURIComponent(slug)}`;
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      showError(body?.error ?? `Could not create album (${res.status})`);
    } catch {
      showError("Could not create album — network error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
