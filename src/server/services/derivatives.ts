import { mkdir, rename, writeFile } from "node:fs/promises";
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
  return `${paths.derivatives}/${photoId}/${variant}.${ext}`;
}

/**
 * Generate every size × format derivative for an original buffer.
 *
 * For each {@link DerivativeSpec} × {@link DerivativeFormat}: honor EXIF
 * orientation (`.rotate()`), resize to fit `maxEdge` (never enlarging), encode,
 * and write atomically (temp file + rename) so a crashed ingest can't leave a
 * half-written file that `existsSync` would treat as valid.
 */
export async function generateDerivatives(
  ctx: Ctx,
  photoId: string,
  original: Buffer,
): Promise<void> {
  await mkdir(`${paths.derivatives}/${photoId}`, { recursive: true });

  for (const spec of DERIVATIVES) {
    for (const format of DERIVATIVE_FORMATS) {
      const pipeline = sharp(original)
        .rotate()
        .resize(spec.maxEdge, spec.maxEdge, { fit: "inside", withoutEnlargement: true });
      const buffer = await format.encode(pipeline).toBuffer();

      const finalPath = derivativePath(photoId, spec.name, format.ext);
      const tmpPath = `${finalPath}.tmp`;
      await writeFile(tmpPath, buffer);
      await rename(tmpPath, finalPath);
    }
  }
}
