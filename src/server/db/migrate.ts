import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Applies schema.sql idempotently. Safe to run on every boot. */
export function migrate(): void {
  const schema = readFileSync(join(here, "schema.sql"), "utf8");
  getDb().exec(schema);
}

// Allow `pnpm db:migrate` / `node dist/server/db/migrate.js` to run directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate();
  console.log("✓ migration applied");
}
