import { rgbaToThumbHash, thumbHashToRGBA } from "thumbhash";

/**
 * Encode an RGBA bitmap into a base64 ThumbHash string for storage.
 *
 * ThumbHash requires the input be downscaled to at most 100×100 (preserving
 * aspect ratio) before encoding — callers must resize first.
 */
export function encodeThumbHash(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): string {
  const hash = rgbaToThumbHash(width, height, rgba);
  return Buffer.from(hash).toString("base64");
}

/** Decode a stored base64 ThumbHash back to an RGBA bitmap (used in tests/SSR). */
export function decodeThumbHash(base64: string): {
  width: number;
  height: number;
  rgba: Uint8Array;
} {
  const bytes = Buffer.from(base64, "base64");
  const { w, h, rgba } = thumbHashToRGBA(bytes);
  return { width: w, height: h, rgba };
}
