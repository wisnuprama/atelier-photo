/** Escape text for safe interpolation into HTML element content / attributes. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Serialize data for embedding in a <script type="application/json"> tag.
 * Escapes `<` so a `</script>` in the data cannot break out of the element.
 */
export function jsonScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** URL for a photo's served derivative variant (e.g. "thumb", "full"). */
export function mediaUrl(photoId: string, variant: "thumb" | "full"): string {
  return `/media/${encodeURIComponent(photoId)}/${variant}`;
}
