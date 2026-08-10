/**
 * Backfill derivatives for photos ingested before a new size/format existed
 * (e.g. the `medium` 1600px variant). For every photo missing any size × format
 * file, regenerates the full derivative set from the stored original. Writes
 * are atomic (temp file + rename), so re-running is always safe.
 *
 * Usage:
 *   pnpm derivatives:backfill            # only photos with missing files
 *   pnpm derivatives:backfill --force    # regenerate everything
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { paths } from "../src/server/config.js";
import { consoleCtx } from "../src/server/context.js";
import { closeDb, getDb } from "../src/server/db/index.js";
import {
  DERIVATIVE_FORMATS,
  DERIVATIVES,
  derivativePath,
  generateDerivatives,
} from "../src/server/services/derivatives.js";

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

let regenerated = 0;
let skipped = 0;
let failed = 0;

// Sequential on purpose: each regeneration decodes a full original with sharp,
// and running them concurrently would spike memory.
for (const photo of photos) {
  const missing = force ? ["(forced)"] : missingVariants(photo.id);
  if (missing.length === 0) {
    skipped++;
    continue;
  }

  const originalFile = join(paths.originals, photo.id, photo.filename);
  if (!existsSync(originalFile)) {
    console.error(`SKIP ${photo.id}: original not found at ${originalFile}`);
    failed++;
    continue;
  }

  try {
    console.log(`${photo.id} (${photo.filename}): regenerating [${missing.join(", ")}]`);
    await generateDerivatives(consoleCtx, photo.id, await readFile(originalFile));
    regenerated++;
  } catch (err) {
    console.error(`FAIL ${photo.id}:`, err);
    failed++;
  }
}

closeDb();
console.log(
  `done: ${regenerated} regenerated, ${skipped} already complete, ${failed} failed (of ${photos.length})`,
);
process.exitCode = failed > 0 ? 1 : 0;
