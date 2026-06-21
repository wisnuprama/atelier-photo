import { thumbHashToRGBA } from "thumbhash";

const dataUrlCache = new Map<string, string>();

/** Decode a base64 ThumbHash into a small data-URL image for use as a CSS background. */
function thumbHashToDataUrl(base64: string): string {
  const cached = dataUrlCache.get(base64);
  if (cached) return cached;

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { w, h, rgba } = thumbHashToRGBA(bytes);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const image = ctx.createImageData(w, h);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);

  const url = canvas.toDataURL();
  dataUrlCache.set(base64, url);
  return url;
}

/**
 * Paint decoded ThumbHash blur-ups as the background of every `[data-thumbhash]`
 * placeholder under `root`, then drop the attribute so it's only done once.
 */
export function applyThumbHashes(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-thumbhash]");
  for (const el of nodes) {
    const hash = el.dataset.thumbhash;
    if (!hash) continue;
    try {
      const url = thumbHashToDataUrl(hash);
      if (url) el.style.backgroundImage = `url(${url})`;
    } catch {
      // Malformed hash: leave the neutral hairline background in place.
    }
    delete el.dataset.thumbhash;
  }
}
