import { paths } from "../config.js";

/**
 * Resized derivatives generated from each original at ingest. The timeline
 * serves `full`; the album grid can serve `thumb`.
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

/** Absolute path where a given photo's derivative variant is stored. */
export function derivativePath(photoId: string, variant: string): string {
  return `${paths.derivatives}/${photoId}/${variant}.webp`;
}

/**
 * Generate all derivative sizes for an original buffer.
 *
 * TODO(later pass): implement the real sharp pipeline — for each
 * {@link DerivativeSpec}, resize the original to `maxEdge`, encode to webp,
 * and write to {@link derivativePath}. Until then ingestion is stubbed and
 * the media route serves a generated placeholder.
 */
export async function generateDerivatives(_photoId: string, _original: Buffer): Promise<void> {
  throw new Error("generateDerivatives: not implemented (later pass)");
}
