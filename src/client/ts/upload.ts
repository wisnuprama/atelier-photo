import { createModal } from "./modal.js";

/** MIME types the server-side sharp pipeline decodes reliably (no HEIC). */
export const ACCEPTED_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
  "image/gif",
]);

/** Mirrors the server's MAX_UPLOAD_BYTES request ceiling. */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

/**
 * Upload at most this many files at once. Kept small: each in-flight request
 * buffers its full body (up to 60 MB) in server memory, and the server's
 * ingest limiter serializes the heavy image work anyway — the win here is
 * overlapping network transfer with ingest, not flooding the server.
 */
export const MAX_CONCURRENT_UPLOADS = 3;

/** Reason a file cannot be uploaded, or null when it is acceptable. */
export function fileError(file: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.has(file.type)) return "Unsupported type";
  if (file.size > MAX_FILE_BYTES) return "Over 60 MB";
  if (file.size === 0) return "Empty file";
  return null;
}

/** Human-readable size: "412 KB", "3.2 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadRow {
  file: File;
  status: HTMLElement;
  bar: HTMLElement | null;
}

function uploadFile(
  albumSlug: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ status: "created" | "replaced" }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/photos/upload");
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        resolve(xhr.response as { status: "created" | "replaced" });
      } else {
        const message =
          (xhr.response as { error?: string } | null)?.error ?? `Failed (${xhr.status})`;
        reject(new Error(message));
      }
    });
    const form = new FormData();
    form.append("album", albumSlug);
    form.append("file", file, file.name);
    xhr.send(form);
  });
}

/** Wire the admin photo-upload modal on an album page. */
export function initUpload(): void {
  const root = document.getElementById("uploadModal");
  if (!root) return;
  const albumSlug = root.dataset.albumSlug;
  const dropzone = document.getElementById("uploadDropzone");
  const input = document.getElementById("uploadInput") as HTMLInputElement | null;
  const list = document.getElementById("uploadList");
  const counter = document.getElementById("uploadCounter");
  const doneBtn = document.getElementById("uploadDone") as HTMLButtonElement | null;
  if (!albumSlug || !dropzone || !input || !list || !counter || !doneBtn) return;

  const modal = createModal(root);
  const queue: UploadRow[] = [];
  let running = false;
  let attempted = 0;
  let succeeded = 0;

  function updateCounter(): void {
    counter!.textContent = attempted > 0 ? `${succeeded} of ${attempted} uploaded` : "";
  }

  function setBusy(busy: boolean): void {
    running = busy;
    modal.setLocked(busy);
    doneBtn!.disabled = busy;
  }

  function addRow(file: File): void {
    const li = document.createElement("li");
    li.className = "border-b border-hairline py-2.5 last:border-b-0";

    const line = document.createElement("div");
    line.className = "flex items-center gap-3";
    const name = document.createElement("span");
    name.className = "flex-1 font-mono text-[12px] truncate";
    name.textContent = file.name;
    const size = document.createElement("span");
    size.className = "font-mono text-[11px] text-stone shrink-0";
    size.textContent = formatBytes(file.size);
    const status = document.createElement("span");
    status.className = "font-mono text-[9px] label uppercase text-stone shrink-0";
    line.append(name, size, status);
    li.append(line);

    const error = fileError(file);
    if (error) {
      status.textContent = error;
      status.classList.replace("text-stone", "text-red-600");
      list!.append(li);
      return;
    }

    status.textContent = "Queued";
    const track = document.createElement("div");
    track.className = "hidden mt-2 h-[2px] bg-hairline";
    const bar = document.createElement("div");
    bar.className = "h-[2px] bg-ink";
    bar.style.width = "0%";
    track.append(bar);
    li.append(track);
    list!.append(li);

    attempted++;
    updateCounter();
    queue.push({ file, status, bar });
  }

  async function uploadRow(row: UploadRow): Promise<void> {
    const { file, status, bar } = row;
    const track = bar?.parentElement;
    track?.classList.remove("hidden");
    status.textContent = "Uploading 0%";
    try {
      const result = await uploadFile(albumSlug!, file, (pct) => {
        status.textContent = `Uploading ${pct}%`;
        if (bar) bar.style.width = `${pct}%`;
      });
      status.textContent = result.status === "replaced" ? "Replaced ✓" : "Created ✓";
      succeeded++;
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Failed";
      status.classList.replace("text-stone", "text-red-600");
    }
    track?.classList.add("hidden");
    updateCounter();
  }

  let active = 0;

  // Worker pool: start queued uploads until MAX_CONCURRENT_UPLOADS are in
  // flight; each settled upload calls back in to start the next. New drops
  // while uploads run just extend `queue` and are picked up here.
  function pump(): void {
    while (active < MAX_CONCURRENT_UPLOADS && queue.length > 0) {
      if (!running) setBusy(true);
      active++;
      const row = queue.shift()!;
      void uploadRow(row).finally(() => {
        active--;
        if (active === 0 && queue.length === 0) setBusy(false);
        else pump();
      });
    }
  }

  function enqueue(files: FileList | null): void {
    if (!files || files.length === 0) return;
    for (const file of files) addRow(file);
    pump();
  }

  for (const btn of document.querySelectorAll<HTMLElement>("[data-upload-open]")) {
    btn.addEventListener("click", () => modal.open());
  }

  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => {
    enqueue(input.files);
    input.value = "";
  });

  const highlight = ["border-ink", "bg-stone/5"];
  for (const type of ["dragenter", "dragover"] as const) {
    dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      dropzone.classList.add(...highlight);
    });
  }
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove(...highlight));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove(...highlight);
    enqueue(e.dataTransfer?.files ?? null);
  });

  // Closing after a successful batch reloads so the SSR page picks up the new
  // photos (thumbhashes, viewer data, year rail). createModal ignores close
  // while locked, so this only fires between batches.
  for (const el of root.querySelectorAll<HTMLElement>("[data-modal-close]")) {
    el.addEventListener("click", () => {
      if (!running && succeeded > 0) location.reload();
    });
  }
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !running && succeeded > 0) location.reload();
  });
}
