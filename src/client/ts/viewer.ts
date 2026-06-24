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
  const frame = document.getElementById("imageFrame");
  const panel = document.getElementById("exifPanel");
  const scrim = document.getElementById("exifScrim");
  const hint = document.getElementById("swipeHint");
  if (!lightbox || !imgA || !imgB || !stage || !frame || !panel || photos.length === 0) return;

  const layers: [HTMLImageElement, HTMLImageElement] = [imgA, imgB];
  let front: 0 | 1 = 0;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let lastFocused: HTMLElement | null = null;
  let hintTimer: number | undefined;

  const $ = byId;

  // ----- zoom state -----
  let scale = 1;
  let tx = 0;
  let ty = 0;

  function applyTransform(animated?: boolean): void {
    if (animated && !reduceMotion) {
      frame!.style.transition = "transform 0.15s ease-out";
    } else {
      frame!.style.transition = "";
    }
    frame!.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    // Promote to a compositor layer only while zoomed/panned; drop it at rest
    // so we don't pin a layer for every photo that's never zoomed.
    frame!.style.willChange = scale > 1 ? "transform" : "";
  }

  function clampPan(): void {
    // Clamp to the displayed image box (object-contain), not the frame, so we
    // can't pan letterbox/empty paper into view for off-aspect photos.
    const fw = frame!.offsetWidth;
    const fh = frame!.offsetHeight;
    let dw = fw;
    let dh = fh;
    const img = layers[front];
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      const ar = img.naturalWidth / img.naturalHeight;
      if (fw / fh > ar) {
        dh = fh;
        dw = fh * ar;
      } else {
        dw = fw;
        dh = fw / ar;
      }
    }
    const maxTx = Math.max(0, (scale * dw - fw) / 2);
    const maxTy = Math.max(0, (scale * dh - fh) / 2);
    tx = Math.max(-maxTx, Math.min(maxTx, tx));
    ty = Math.max(-maxTy, Math.min(maxTy, ty));
  }

  function resetZoom(animated?: boolean): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform(animated);
  }

  // Zoom to newScale keeping the point (cx, cy) — relative to frame center — fixed on screen.
  function zoomAround(newScale: number, cx: number, cy: number): void {
    const clamped = Math.max(1, Math.min(5, newScale));
    tx += cx * (1 - clamped / scale);
    ty += cy * (1 - clamped / scale);
    scale = clamped;
    clampPan();
  }

  // ----- EXIF panel -----
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
    resetZoom();
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
    resetZoom();
    index = (index + 1) % photos.length;
    render();
  }
  function prev(): void {
    resetZoom();
    index = (index - 1 + photos.length) % photos.length;
    render();
  }

  function isOpen(): boolean {
    return !lightbox!.classList.contains("hidden");
  }

  // ----- wire controls (data-attribute driven) -----
  for (const btn of document.querySelectorAll<HTMLElement>("[data-viewer-open]")) {
    btn.addEventListener("click", () => openViewer(Number(btn.dataset.index), btn));
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
    if (e.key === "Escape") {
      // First press resets zoom if zoomed; second press (or zoom already 1) closes.
      if (scale > 1) {
        resetZoom(true);
        return;
      }
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") next();
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") prev();
    else if (e.key === "+" || e.key === "=") {
      zoomAround(scale * 1.3, 0, 0);
      applyTransform(true);
    } else if (e.key === "-") {
      zoomAround(scale / 1.3, 0, 0);
      applyTransform(true);
    } else if (e.key === "0") resetZoom(true);
  });

  // ----- scroll-wheel zoom (desktop / trackpad pinch) -----
  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = frame!.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      // macOS trackpad pinch fires wheel+ctrlKey with larger deltaY values.
      const factor = e.ctrlKey ? 0.02 : 0.005;
      zoomAround(scale * (1 + -e.deltaY * factor), cx, cy);
      applyTransform();
    },
    { passive: false },
  );

  // ----- touch gestures: swipe nav, pinch zoom, pan, double-tap -----
  // Hardened for iOS modal webviews (see swipe-fix plan).

  // Swipe / pan state
  let sY: number | null = null;
  let sX = 0;
  let sT = 0;
  let sActive = false;
  let panLastX = 0;
  let panLastY = 0;

  // Pinch state
  let pinching = false;
  let pinchDist0 = 0;
  let pinchScale0 = 1;
  let pinchCx = 0;
  let pinchCy = 0;

  // Double-tap state
  let lastTapT = 0;
  let lastTapX = 0;
  let lastTapY = 0;

  function getTouchDist(e: TouchEvent): number {
    const t0 = e.touches[0]!;
    const t1 = e.touches[1]!;
    return Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  }

  function getTouchCenter(e: TouchEvent): [number, number] {
    const t0 = e.touches[0]!;
    const t1 = e.touches[1]!;
    const rect = frame!.getBoundingClientRect();
    return [
      (t0.clientX + t1.clientX) / 2 - (rect.left + rect.width / 2),
      (t0.clientY + t1.clientY) / 2 - (rect.top + rect.height / 2),
    ];
  }

  stage.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        // Begin pinch: capture initial distance and centroid relative to frame center.
        pinching = true;
        pinchDist0 = getTouchDist(e);
        pinchScale0 = scale;
        [pinchCx, pinchCy] = getTouchCenter(e);
        sY = null;
        sActive = false;
        return;
      }

      const t = e.touches[0];
      if (!t) return;

      // Double-tap detection: two taps within 300 ms and 30 px.
      const now = Date.now();
      const tapDist = Math.hypot(t.clientX - lastTapX, t.clientY - lastTapY);
      if (now - lastTapT < 300 && tapDist < 30) {
        if (scale > 1) {
          resetZoom(true);
        } else {
          const rect = frame!.getBoundingClientRect();
          const cx = t.clientX - (rect.left + rect.width / 2);
          const cy = t.clientY - (rect.top + rect.height / 2);
          zoomAround(2.5, cx, cy);
          applyTransform(true);
        }
        lastTapT = 0; // prevent triple-tap re-triggering
        return;
      }
      lastTapT = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;

      // Single-touch start: record for swipe nav (scale=1) or pan (scale>1).
      sActive = t.clientY > EDGE_TOP && t.clientY < window.innerHeight - EDGE_BOTTOM;
      sY = t.clientY;
      sX = t.clientX;
      sT = Date.now();
      panLastX = t.clientX;
      panLastY = t.clientY;
    },
    { passive: true },
  );

  stage.addEventListener(
    "touchmove",
    (e) => {
      if (pinching) {
        if (e.touches.length < 2) return;
        if (pinchDist0 < 1) return; // coincident touches — avoid divide-by-zero
        const dist = getTouchDist(e);
        // Keep the initial centroid fixed while scaling.
        const newScale = Math.max(1, Math.min(5, pinchScale0 * (dist / pinchDist0)));
        tx += pinchCx * (1 - newScale / scale);
        ty += pinchCy * (1 - newScale / scale);
        scale = newScale;
        clampPan();
        applyTransform();
        e.preventDefault();
        return;
      }

      if (sY === null) return;
      const t = e.touches[0];
      if (!t) return;

      if (scale > 1) {
        // Pan mode: drag translates the image; swipe nav is suppressed.
        tx += t.clientX - panLastX;
        ty += t.clientY - panLastY;
        clampPan();
        applyTransform();
        panLastX = t.clientX;
        panLastY = t.clientY;
        e.preventDefault();
        return;
      }

      // Swipe mode (scale === 1): own predominantly-vertical pans so the host's
      // swipe-to-dismiss / Safari rubber-band cannot hijack navigation.
      const dy = t.clientY - sY;
      const dx = t.clientX - sX;
      if (Math.abs(dy) > Math.abs(dx)) e.preventDefault();
    },
    { passive: false },
  );

  stage.addEventListener(
    "touchend",
    (e) => {
      if (pinching) {
        if (e.touches.length < 2) pinching = false;
        return;
      }

      if (scale > 1) {
        // End of pan — no navigation.
        sY = null;
        sActive = false;
        return;
      }

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
