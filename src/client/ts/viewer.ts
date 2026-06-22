interface ViewerPhoto {
  src: string;
  title: string;
  commentary: string;
  date: string;
  filename: string;
  camera: string;
  lens: string;
  focal: string;
  aperture: string;
  shutter: string;
  iso: string;
}

const EDGE_TOP = 44; // native sheet-dismiss grabber zone — leave to the host app
const EDGE_BOTTOM = 24; // iOS home-indicator zone

const byId = (id: string): HTMLElement | null => document.getElementById(id);

function readPhotos(): ViewerPhoto[] {
  const tag = document.getElementById("viewer-data");
  if (!tag?.textContent) return [];
  try {
    return JSON.parse(tag.textContent) as ViewerPhoto[];
  } catch {
    return [];
  }
}

export function initViewer(): void {
  const photos = readPhotos();
  const lightbox = document.getElementById("lightbox");
  const imgA = document.getElementById("lightboxImgA") as HTMLImageElement | null;
  const imgB = document.getElementById("lightboxImgB") as HTMLImageElement | null;
  const stage = document.getElementById("imageStage");
  const panel = document.getElementById("exifPanel");
  const scrim = document.getElementById("exifScrim");
  const hint = document.getElementById("swipeHint");
  if (!lightbox || !imgA || !imgB || !stage || !panel || photos.length === 0) return;

  const layers: [HTMLImageElement, HTMLImageElement] = [imgA, imgB];
  let front: 0 | 1 = 0;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let lastFocused: HTMLElement | null = null;
  let hintTimer: number | undefined;

  const $ = byId;

  function closeExifSheet(): void {
    panel!.classList.remove("translate-y-0");
    panel!.classList.add("translate-y-full");
    scrim?.classList.add("hidden");
  }

  function toggleExif(): void {
    const open = panel!.classList.contains("translate-y-0");
    if (open) {
      closeExifSheet();
    } else {
      panel!.classList.remove("translate-y-full");
      panel!.classList.add("translate-y-0");
      scrim?.classList.remove("hidden");
    }
  }

  function render(): void {
    const p = photos[index];
    if (!p) return;

    const altTitle = p.title || "Photograph";
    const backIdx = (front ^ 1) as 0 | 1;
    if (reduceMotion) {
      const cur = layers[front];
      cur.src = p.src;
      cur.alt = altTitle;
      cur.style.opacity = "1";
      layers[backIdx].style.opacity = "0";
    } else {
      const back = layers[backIdx];
      const cur = layers[front];
      const pre = new Image();
      const show = (): void => {
        back.src = p.src;
        back.alt = altTitle;
        back.style.transition = "opacity .4s";
        cur.style.transition = "opacity .4s";
        requestAnimationFrame(() => {
          back.style.opacity = "1";
          cur.style.opacity = "0";
          front = backIdx;
        });
      };
      pre.addEventListener("load", show, { once: true });
      pre.addEventListener("error", show, { once: true });
      pre.src = p.src;
    }

    const titleEl = $("exifTitle");
    if (titleEl) titleEl.textContent = p.title;
    const date = $("exifDate");
    if (date) date.textContent = p.date;
    const note = $("exifNote");
    if (note) {
      note.textContent = p.commentary;
      note.style.display = p.commentary ? "block" : "none";
    }

    const rows: Array<[string, string]> = [
      ["File", p.filename],
      ["Camera", p.camera],
      ["Lens", p.lens],
      ["Focal length", p.focal],
      ["Aperture", p.aperture],
      ["Shutter", p.shutter],
      ["ISO", p.iso],
    ];
    const list = $("exifList");
    if (list) {
      list.replaceChildren();
      for (const [k, v] of rows) {
        if (!v) continue;
        const wrap = document.createElement("div");
        wrap.className =
          "flex items-baseline justify-between gap-4 py-2 border-b border-hairline last:border-0";
        const dt = document.createElement("dt");
        dt.className = "font-mono text-[10px] label text-stone uppercase";
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.className = "font-mono text-[12px] text-ink text-right";
        dd.textContent = v;
        wrap.append(dt, dd);
        list.append(wrap);
      }
    }

    const count = $("lightboxCount");
    if (count) {
      count.textContent = `${String(index + 1).padStart(2, "0")} / ${String(photos.length).padStart(2, "0")}`;
    }
  }

  function showSwipeHint(): void {
    if (!hint) return;
    window.clearTimeout(hintTimer);
    hint.classList.remove("opacity-0");
    hintTimer = window.setTimeout(() => hint.classList.add("opacity-0"), 2600);
  }

  function openViewer(i: number, trigger: HTMLElement | null): void {
    index = i;
    lastFocused = trigger;
    closeExifSheet();
    render();
    lightbox!.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    lightbox!.focus();
    showSwipeHint();
  }

  function close(): void {
    closeExifSheet();
    lightbox!.classList.add("hidden");
    document.body.style.overflow = "";
    // Sync the timeline scroll position back to the photo we were viewing.
    const row = document.querySelectorAll<HTMLElement>(".photo-row")[index];
    if (row) {
      const top = row.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top, behavior: "auto" });
    }
    lastFocused?.focus();
  }

  function next(): void {
    index = (index + 1) % photos.length;
    render();
  }
  function prev(): void {
    index = (index - 1 + photos.length) % photos.length;
    render();
  }

  function isOpen(): boolean {
    return !lightbox!.classList.contains("hidden");
  }

  // ----- wire controls (data-attribute driven) -----
  // Grid thumbnails open on `click`, but iOS/WebKit suppresses the synthesized
  // click when a tap drifts slightly on a vertically-scrollable list — so the
  // viewer never opened on touch. Add a pointer-based fallback that opens on a
  // short, near-stationary tap, debounced so the (sometimes-fired) click and the
  // fallback can't double-open.
  let lastOpenTs = 0;
  const openFromTrigger = (btn: HTMLElement): void => {
    const now = Date.now();
    if (now - lastOpenTs < 500) return;
    lastOpenTs = now;
    openViewer(Number(btn.dataset.index), btn);
  };

  for (const btn of document.querySelectorAll<HTMLElement>("[data-viewer-open]")) {
    btn.addEventListener("click", () => openFromTrigger(btn));

    let px = 0;
    let py = 0;
    let pt = 0;
    btn.addEventListener(
      "pointerdown",
      (e) => {
        px = e.clientX;
        py = e.clientY;
        pt = Date.now();
      },
      { passive: true },
    );
    btn.addEventListener(
      "pointerup",
      (e) => {
        if (e.pointerType === "mouse") return; // mouse fires a reliable click already
        const moved = Math.hypot(e.clientX - px, e.clientY - py);
        if (moved < 12 && Date.now() - pt < 700) openFromTrigger(btn);
      },
      { passive: true },
    );
  }
  for (const btn of document.querySelectorAll<HTMLElement>("[data-viewer-close]")) {
    btn.addEventListener("click", close);
  }
  for (const btn of document.querySelectorAll<HTMLElement>("[data-viewer-prev]")) {
    btn.addEventListener("click", prev);
  }
  for (const btn of document.querySelectorAll<HTMLElement>("[data-viewer-next]")) {
    btn.addEventListener("click", next);
  }
  for (const btn of document.querySelectorAll<HTMLElement>("[data-exif-toggle]")) {
    btn.addEventListener("click", toggleExif);
  }
  lightbox.setAttribute("tabindex", "-1");

  // ----- keyboard -----
  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") next();
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") prev();
  });

  // ----- vertical swipe, hardened for iOS modal webviews -----
  let sY: number | null = null;
  let sX = 0;
  let sT = 0;
  let sActive = false;

  stage.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      if (!t) return;
      sActive = t.clientY > EDGE_TOP && t.clientY < window.innerHeight - EDGE_BOTTOM;
      sY = t.clientY;
      sX = t.clientX;
      sT = Date.now();
    },
    { passive: true },
  );

  stage.addEventListener(
    "touchmove",
    (e) => {
      if (!sActive || sY === null) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - sY;
      const dx = t.clientX - sX;
      // Own predominantly-vertical pans so the host's swipe-to-dismiss / Safari
      // rubber-band cannot hijack navigation.
      if (Math.abs(dy) > Math.abs(dx)) e.preventDefault();
    },
    { passive: false },
  );

  stage.addEventListener(
    "touchend",
    (e) => {
      if (sY === null) {
        sActive = false;
        return;
      }
      const sheetOpen = panel!.classList.contains("translate-y-0") && window.innerWidth < 1024;
      const t = e.changedTouches[0];
      if (t) {
        const dy = t.clientY - sY;
        const dx = t.clientX - sX;
        const dt = Math.max(Date.now() - sT, 1);
        const decisive =
          sActive &&
          !sheetOpen &&
          Math.abs(dy) > Math.abs(dx) * 1.2 && // clearly vertical, not diagonal
          Math.abs(dy) > 50 && // far enough to count
          (Math.abs(dy) / dt > 0.3 || Math.abs(dy) > 130); // a flick, or a long deliberate drag
        if (decisive) {
          if (dy < 0) next();
          else prev();
          hint?.classList.add("opacity-0");
        }
      }
      sY = null;
      sActive = false;
    },
    { passive: false },
  );
}
