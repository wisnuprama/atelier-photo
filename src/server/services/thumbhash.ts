import sharp from "sharp";
import { rgbaToThumbHash, thumbHashToRGBA } from "thumbhash";
import type { Ctx } from "../context.js";

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

/**
 * Compute a base64 ThumbHash for an original image at ingest. Honors EXIF
 * orientation and downscales to ≤100px on the longest edge (ThumbHash's input
 * limit) before encoding.
 */
export async function computeThumbHash(_ctx: Ctx, original: Buffer): Promise<string> {
  const { data, info } = await sharp(original)
    .rotate()
    .resize(100, 100, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeThumbHash(new Uint8Array(data), info.width, info.height);
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
