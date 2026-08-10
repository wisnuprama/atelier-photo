/**
 * Backfill derivatives for photos ingested before a new size/format existed
 * (e.g. the `medium` 1600px variant). For every photo missing any size × format
 * file, regenerates the full derivative set from the stored original. Writes
 * are atomic (temp file + rename), so re-running is always safe.
 *
 * Lives under src/ (not scripts/) so it compiles into dist/ and ships in the
 * container image, where scripts/ and tsx do not exist.
 *
 * Concurrency comes from the same knobs as the server (config-and-env.md):
 * `INGEST_CONCURRENCY` photos in flight at once via `ingestLimit`, each sharp
 * op using `SHARP_CONCURRENCY` libvips threads. Memory scales with
 * INGEST_CONCURRENCY (each in-flight photo holds its original buffer plus a
 * raw decoded bitmap), and the tool is a separate process from the server, so
 * its budget is its own — keep INGEST_CONCURRENCY × SHARP_CONCURRENCY at or
 * under the container's core count.
 *
 * Usage:
 *   pnpm derivatives:backfill            # dev: only photos with missing files
 *   pnpm derivatives:backfill --force    # dev: regenerate everything
 *
 * In production (Podman):
 *   podman exec -it -e INGEST_CONCURRENCY=4 <container> \
 *     node dist/server/tools/backfill-derivatives.js
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { config, paths } from "../config.js";
import { consoleCtx } from "../context.js";
import { closeDb, getDb } from "../db/index.js";
import {
  DERIVATIVE_FORMATS,
  DERIVATIVES,
  derivativePath,
  generateDerivatives,
} from "../services/derivatives.js";
import { ingestLimit } from "../services/ingest-limiter.js";

// The server applies this in app.ts; this tool is its own process, so it must
// apply the same cap itself or libvips defaults to one thread per core.
sharp.concurrency(config.sharpConcurrency);

const force = process.argv.includes("--force");

function missingVariants(photoId: string): string[] {
  const missing: string[] = [];
  for (const spec of DERIVATIVES) {
    for (const format of DERIVATIVE_FORMATS) {
      if (!existsSync(derivativePath(photoId, spec.name, format.ext))) {
        missing.push(`${spec.name}.${format.ext}`);
      }
    }
  }
  return missing;
}

const photos = getDb()
  .prepare(`SELECT id, filename FROM photos ORDER BY created_at`)
  .all() as Array<{ id: string; filename: string }>;
closeDb();

let regenerated = 0;
let skipped = 0;
let failed = 0;

console.log(
  `backfilling ${photos.length} photos ` +
    `(ingest concurrency ${config.ingestConcurrency}, sharp concurrency ${config.sharpConcurrency})`,
);

await Promise.all(
  photos.map((photo) =>
    ingestLimit(async () => {
      const missing = force ? ["(forced)"] : missingVariants(photo.id);
      if (missing.length === 0) {
        skipped++;
        return;
      }

      const originalFile = join(paths.originals, photo.id, photo.filename);
      if (!existsSync(originalFile)) {
        console.error(`SKIP ${photo.id}: original not found at ${originalFile}`);
        failed++;
        return;
      }

      try {
        console.log(`${photo.id} (${photo.filename}): regenerating [${missing.join(", ")}]`);
        await generateDerivatives(consoleCtx, photo.id, await readFile(originalFile));
        regenerated++;
      } catch (err) {
        console.error(`FAIL ${photo.id}:`, err);
        failed++;
      }
    }),
  ),
);

console.log(
  `done: ${regenerated} regenerated, ${skipped} already complete, ${failed} failed (of ${photos.length})`,
);
process.exitCode = failed > 0 ? 1 : 0;
