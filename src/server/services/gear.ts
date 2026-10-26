import type { Ctx } from "../context.js";
import { getDb } from "../db/index.js";

/**
 * Gear DAO for the "My Gear" page. Items are derived at query time from
 * `photos.camera_body` / `photos.lens`; the `gear` table only stores the
 * owner's active/inactive flag (no row ⇒ active).
 */

export type GearKind = "camera" | "lens";
export const GEAR_KINDS: readonly GearKind[] = ["camera", "lens"];

/** Photo column per gear kind. Constants only — never interpolate user input. */
export const GEAR_COLUMN = { camera: "camera_body", lens: "lens" } as const satisfies Record<
  GearKind,
  "camera_body" | "lens"
>;

/** Longest gear name accepted by the toggle (shared with gear search). */
export const GEAR_NAME_MAX = 200;

export function isGearKind(v: unknown): v is GearKind {
  return typeof v === "string" && (GEAR_KINDS as readonly string[]).includes(v);
}

export interface GearItem {
  kind: GearKind;
  /** Exact EXIF string as stored on photos. */
  name: string;
  active: boolean;
  photoCount: number;
  /** UTC year of MIN(taken_at); null if no dated photos. */
  firstYear: number | null;
  /** UTC year of MAX(taken_at); null if no dated photos. */
  lastYear: number | null;
  /** Most recent photo made with this item. */
  sample: {
    id: string;
    width: number;
    height: number;
    thumbhash: string | null;
    title: string | null;
  };
}

interface GearRow {
  kind: GearKind;
  name: string;
  photo_count: number;
  first_taken: string | null;
  last_taken: string | null;
  active: number;
  sample_id: string;
  sample_width: number;
  sample_height: number;
  sample_thumbhash: string | null;
  sample_title: string | null;
}

/** One UNION branch per kind; the column comes from GEAR_COLUMN (constants). */
function itemsBranch(kind: GearKind): string {
  const col = GEAR_COLUMN[kind];
  return `SELECT '${kind}' AS kind, ${col} AS name, COUNT(*) AS photo_count,
         MIN(taken_at) AS first_taken, MAX(taken_at) AS last_taken,
         (SELECT p.id FROM photos p WHERE p.${col} = ph.${col}
            ORDER BY p.taken_at DESC, p.created_at DESC LIMIT 1) AS sample_id
    FROM photos ph
   WHERE ${col} IS NOT NULL AND trim(${col}) <> ''
   GROUP BY ${col}`;
}

const LIST_GEAR_SQL = `WITH items AS (
  ${GEAR_KINDS.map(itemsBranch).join("\n  UNION ALL\n  ")}
)
SELECT i.kind, i.name, i.photo_count, i.first_taken, i.last_taken,
       COALESCE(g.active, 1) AS active,
       s.id AS sample_id, s.width AS sample_width, s.height AS sample_height,
       s.thumbhash AS sample_thumbhash, s.title AS sample_title
  FROM items i
  LEFT JOIN gear g   ON g.kind = i.kind AND g.name = i.name
  JOIN photos s      ON s.id = i.sample_id
 ORDER BY i.last_taken IS NULL, i.last_taken DESC, i.photo_count DESC, i.name ASC`;

/** UTC year of an ISO timestamp (same rule as getPhotoYearRange), or null. */
function utcYear(iso: string | null): number | null {
  if (!iso) return null;
  const year = new Date(iso).getUTCFullYear();
  return Number.isNaN(year) ? null : year;
}

function toGearItem(row: GearRow): GearItem {
  return {
    kind: row.kind,
    name: row.name,
    active: row.active === 1,
    photoCount: row.photo_count,
    firstYear: utcYear(row.first_taken),
    lastYear: utcYear(row.last_taken),
    sample: {
      id: row.sample_id,
      width: row.sample_width,
      height: row.sample_height,
      thumbhash: row.sample_thumbhash,
      title: row.sample_title,
    },
  };
}

/**
 * Every camera body and lens found in photos, most recently used first
 * (undated last), then by photo count, then by name. Flat list; the view
 * groups it into active/inactive × camera/lens.
 */
export function listGear(_ctx: Ctx): GearItem[] {
  return getDb().prepare<[], GearRow>(LIST_GEAR_SQL).all().map(toGearItem);
}

function httpError(message: string, statusCode: number): Error {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = statusCode;
  return err;
}

/**
 * Mark a gear item active or inactive. The name is stored exactly as given so
 * it matches the photos value byte for byte. Throws a 400-tagged Error for a
 * blank or over-long name and a 404-tagged Error when no photo carries it.
 */
export function setGearActive(_ctx: Ctx, kind: GearKind, name: string, active: boolean): void {
  if (!name.trim() || name.length > GEAR_NAME_MAX) {
    throw httpError("Invalid gear name", 400);
  }
  const db = getDb();
  const exists = db
    .prepare<[string], { 1: number }>(`SELECT 1 FROM photos WHERE ${GEAR_COLUMN[kind]} = ? LIMIT 1`)
    .get(name);
  if (!exists) throw httpError("Gear not found", 404);
  db.prepare(
    `INSERT INTO gear (kind, name, active) VALUES (?, ?, ?)
     ON CONFLICT(kind, name) DO UPDATE SET active = excluded.active`,
  ).run(kind, name, active ? 1 : 0);
}
