import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";
import { paths } from "../config.js";
import type { Ctx } from "../context.js";

/**
 * Resized derivatives generated from each original at ingest. The timeline
 * serves `full`; the album grid serves `thumb`.
 */
export interface DerivativeSpec {
  readonly name: string;
  /** Longest-edge target in pixels. */
  readonly maxEdge: number;
}

export const DERIVATIVES: readonly DerivativeSpec[] = [
  { name: "thumb", maxEdge: 800 },
  { name: "full", maxEdge: 2400 },
] as const;

export const DERIVATIVE_NAMES = new Set(DERIVATIVES.map((d) => d.name));

/**
 * Output formats emitted per size. Order is the negotiation preference: the
 * media route walks this list (best → worst) and serves the first the client
 * accepts. JPEG is the universal fallback every client understands.
 */
export interface DerivativeFormat {
  readonly ext: "avif" | "webp" | "jpeg";
  readonly mime: string;
  readonly encode: (pipeline: Sharp) => Sharp;
}

export const DERIVATIVE_FORMATS: readonly DerivativeFormat[] = [
  { ext: "avif", mime: "image/avif", encode: (p) => p.avif({ quality: 50 }) },
  { ext: "webp", mime: "image/webp", encode: (p) => p.webp({ quality: 80 }) },
  { ext: "jpeg", mime: "image/jpeg", encode: (p) => p.jpeg({ quality: 82, mozjpeg: true }) },
] as const;

/** Absolute path where a given photo's derivative variant/format is stored. */
export function derivativePath(photoId: string, variant: string, ext: string): string {
  return path.join(paths.derivatives, photoId, `${variant}.${ext}`);
}

/**
 * Generate every size × format derivative for an original buffer.
 *
 * The original is decoded exactly once: it is EXIF-rotated and downscaled to the
 * largest spec into a raw bitmap, and every size × {@link DerivativeFormat} is
 * then derived from that already-oriented intermediate (smaller sizes resize
 * down from it). Each variant is written atomically (temp file + rename) so a
 * crashed ingest can't leave a half-written file that `existsSync` would treat
 * as valid.
 */
export async function generateDerivatives(
  ctx: Ctx,
  photoId: string,
  original: Buffer,
): Promise<void> {
  ctx.log.info({ photoId }, "generateDerivatives: started");

  const dirPath = path.join(paths.derivatives, photoId);
  await mkdir(dirPath, { recursive: true });
  ctx.log.info({ photoId, dir: dirPath }, "generateDerivatives: created directory");

  // Largest first so every smaller size resizes down from the intermediate.
  const specs = DERIVATIVES.toSorted((a, b) => b.maxEdge - a.maxEdge);
  const largestEdge = Math.max(...specs.map((s) => s.maxEdge));

  // The single full decode of the original. Orientation is baked in here, so no
  // step below may `.rotate()` again. `withoutEnlargement` keeps the largest
  // derivative from upscaling a small original.
  const { data, info } = await sharp(original)
    .rotate()
    .resize(largestEdge, largestEdge, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { width: info.width, height: info.height, channels: info.channels };

  for (const spec of specs) {
    const sized = sharp(data, { raw }).resize(spec.maxEdge, spec.maxEdge, {
      fit: "inside",
      withoutEnlargement: true,
    });
    for (const format of DERIVATIVE_FORMATS) {
      // Clone per format so the resized bitmap is shared, not re-resized.
      const buffer = await format.encode(sized.clone()).toBuffer();

      const finalPath = derivativePath(photoId, spec.name, format.ext);
      const tmpPath = `${finalPath}.tmp`;
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, finalPath);

      ctx.log.info(
        {
          photoId,
          variant: spec.name,
          format: format.ext,
          maxEdge: spec.maxEdge,
          bytes: buffer.length,
        },
        "generateDerivatives: wrote derivative",
      );
    }
  }
}
