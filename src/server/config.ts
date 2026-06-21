import { resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly adminKeyId: string;
  readonly adminHmacSecret: string;
  readonly isProduction: boolean;
}

const dataDir = resolve(process.env.DATA_DIR ?? "data");

export const config: Config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  dataDir,
  adminKeyId: process.env.ADMIN_KEY_ID ?? "",
  adminHmacSecret: process.env.ADMIN_HMAC_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};

/** Canonical on-disk locations, all under DATA_DIR. */
export const paths = {
  db: resolve(dataDir, "gallery.db"),
  originals: resolve(dataDir, "originals"),
  derivatives: resolve(dataDir, "derivatives"),
} as const;
