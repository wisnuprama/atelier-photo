import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { paths } from "../config.js";

let connection: Database.Database | undefined;

/** Lazily-opened, process-wide singleton SQLite connection. */
export function getDb(): Database.Database {
  if (!connection) {
    mkdirSync(dirname(paths.db), { recursive: true });
    connection = new Database(paths.db);
    connection.pragma("journal_mode = WAL");
    connection.pragma("foreign_keys = ON");
  }
  return connection;
}

export function closeDb(): void {
  connection?.close();
  connection = undefined;
}
