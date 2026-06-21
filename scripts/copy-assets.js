// Copies non-TS server assets that tsc does not emit (e.g. SQL schema) into dist/.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const assets = [["src/server/db/schema.sql", "dist/server/db/schema.sql"]];

for (const [from, to] of assets) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${from} → ${to}`);
}
