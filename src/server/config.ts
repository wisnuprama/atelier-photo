import os from "node:os";
import { resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly adminKeyId: string;
  readonly adminHmacSecret: string;
  readonly isProduction: boolean;
  readonly contactEmail: string;
  readonly contactGreeting: string;
  /** Max photos decoded/encoded at once across all requests (INGEST_CONCURRENCY). */
  readonly ingestConcurrency: number;
  /** libvips threads per sharp operation (SHARP_CONCURRENCY). */
  readonly sharpConcurrency: number;
}

const dataDir = resolve(process.env.DATA_DIR ?? "data");

/** Parse a positive-integer env var, falling back when unset or invalid. */
function posInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir,
  adminKeyId: process.env.ADMIN_KEY_ID ?? "",
  adminHmacSecret: process.env.ADMIN_HMAC_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  contactEmail: (process.env.CONTACT_EMAIL ?? "").trim(),
  contactGreeting: (process.env.CONTACT_GREETING ?? "").trim() || "Get in Touch",
  // Defaults sized for a 2 vCPU / 2 GB container; tune via env (e.g. the quadlet
  // EnvironmentFile in prod). See docs/projects/20260628_upload-ingest-optimization.
  ingestConcurrency: posInt(process.env.INGEST_CONCURRENCY, 1),
  sharpConcurrency: posInt(process.env.SHARP_CONCURRENCY, Math.min(2, os.cpus().length)),
};

/** Canonical on-disk locations, all under DATA_DIR. */
export const paths = {
  db: resolve(dataDir, "gallery.db"),
  originals: resolve(dataDir, "originals"),
  derivatives: resolve(dataDir, "derivatives"),
} as const;
