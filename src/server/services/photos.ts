import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { parse as parsePath } from "node:path";
import type { Database } from "better-sqlite3";
import type { Ctx } from "../context.js";
import sharp from "sharp";
import { paths } from "../config.js";
import { getDb } from "../db/index.js";
import { generateDerivatives } from "./derivatives.js";
import { extractExif } from "./exif.js";
import { computeThumbHash } from "./thumbhash.js";

/** Album that incoming photos default to when no album slug is supplied. */
const DEFAULT_ALBUM_SLUG = "discover";
const DEFAULT_ALBUM_NAME = "Discover";

/* ------------------------------------------------------------------ *
 *  Domain types (camelCase view of the DB rows)
 * ------------------------------------------------------------------ */

export interface Album {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverPhotoId: string | null;
  position: number;
  createdAt: string;
}

export interface AlbumWithCover extends Album {
  photoCount: number;
  cover: {
    id: string;
    width: number;
    height: number;
    thumbhash: string | null;
  } | null;
}

export interface Photo {
  id: string;
  albumId: string;
  filename: string;
  title: string | null;
  commentary: string | null;
  takenAt: string | null;
  width: number;
  height: number;
  thumbhash: string | null;
  cameraBody: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutter: string | null;
  iso: string | null;
}

/* ------------------------------------------------------------------ *
 *  Row shapes returned by better-sqlite3
 * ------------------------------------------------------------------ */

interface AlbumRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_photo_id: string | null;
  position: number;
  created_at: string;
  photo_count: number;
  cover_id: string | null;
  cover_width: number | null;
  cover_height: number | null;
  cover_thumbhash: string | null;
}

interface PhotoRow {
  id: string;
  album_id: string;
  filename: string;
  title: string | null;
  commentary: string | null;
  taken_at: string | null;
  width: number;
  height: number;
  thumbhash: string | null;
  camera_body: string | null;
  lens: string | null;
  focal_length: string | null;
  aperture: string | null;
  shutter: string | null;
  iso: string | null;
}

/* ------------------------------------------------------------------ *
 *  Read queries (real — drive SSR)
 * ------------------------------------------------------------------ */

const ALBUM_COLUMNS = `
  a.id, a.slug, a.name, a.description, a.cover_photo_id, a.position, a.created_at,
  (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count,
  cp.id AS cover_id, cp.width AS cover_width, cp.height AS cover_height,
  cp.thumbhash AS cover_thumbhash
`;

const COVER_JOIN = `
  LEFT JOIN photos cp ON cp.id = COALESCE(
    a.cover_photo_id,
    (SELECT p.id FROM photos p WHERE p.album_id = a.id ORDER BY p.taken_at DESC LIMIT 1)
  )
`;

function toAlbumWithCover(row: AlbumRow): AlbumWithCover {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    coverPhotoId: row.cover_photo_id,
    position: row.position,
    createdAt: row.created_at,
    photoCount: row.photo_count,
    cover:
      row.cover_id !== null
        ? {
            id: row.cover_id,
            width: row.cover_width ?? 3,
            height: row.cover_height ?? 4,
            thumbhash: row.cover_thumbhash,
          }
        : null,
  };
}

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    albumId: row.album_id,
    filename: row.filename,
    title: row.title,
    commentary: row.commentary,
    takenAt: row.taken_at,
    width: row.width,
    height: row.height,
    thumbhash: row.thumbhash,
    cameraBody: row.camera_body,
    lens: row.lens,
    focalLength: row.focal_length,
    aperture: row.aperture,
    shutter: row.shutter,
    iso: row.iso,
  };
}

let yearRangeCache: Readonly<{ oldest: number; newest: number }> | null = null;

export function getPhotoYearRange(_ctx: Ctx): Readonly<{ oldest: number; newest: number }> | null {
  if (yearRangeCache) return yearRangeCache;
  const row = getDb()
    .prepare<[], { oldest: string | null; newest: string | null }>(
      `SELECT MIN(taken_at) AS oldest, MAX(taken_at) AS newest FROM photos WHERE taken_at IS NOT NULL`,
    )
    .get();
  if (!row?.oldest || !row?.newest) return null;
  yearRangeCache = Object.freeze({
    oldest: new Date(row.oldest).getUTCFullYear(),
    newest: new Date(row.newest).getUTCFullYear(),
  });
  return yearRangeCache;
}

export function listAlbums(_ctx: Ctx): AlbumWithCover[] {
  const rows = getDb()
    .prepare<[], AlbumRow>(
      `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN}
       ORDER BY a.position ASC, a.created_at ASC`,
    )
    .all();
  return rows.map(toAlbumWithCover);
}

export function getAlbum(_ctx: Ctx, id: string): AlbumWithCover | undefined {
  const row = getDb()
    .prepare<[string], AlbumRow>(
      `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN} WHERE a.id = ?`,
    )
    .get(id);
  return row ? toAlbumWithCover(row) : undefined;
}

export function getAlbumBySlug(_ctx: Ctx, slug: string): AlbumWithCover | undefined {
  const row = getDb()
    .prepare<[string], AlbumRow>(
      `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN} WHERE a.slug = ?`,
    )
    .get(slug);
  return row ? toAlbumWithCover(row) : undefined;
}

export function getPhoto(_ctx: Ctx, id: string): Photo | undefined {
  const row = getDb().prepare<[string], PhotoRow>(`SELECT * FROM photos WHERE id = ?`).get(id);
  return row ? toPhoto(row) : undefined;
}

/** Photos of an album, most recently taken first (timeline order). */
export function listPhotos(_ctx: Ctx, albumId: string): Photo[] {
  const rows = getDb()
    .prepare<[string], PhotoRow>(
      `SELECT * FROM photos WHERE album_id = ?
       ORDER BY taken_at DESC, created_at DESC`,
    )
    .all(albumId);
  return rows.map(toPhoto);
}

/* ------------------------------------------------------------------ *
 *  Slugs & album mutations
 * ------------------------------------------------------------------ */

/** Sanitize arbitrary text into a URL-safe slug. Never empty. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

/** Find a unique slug by appending -2, -3, … until `taken` reports it free. */
function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
  if (!taken(base)) return base;
  let n = 2;
  while (taken(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function nextAlbumPosition(db: Database): number {
  const row = db
    .prepare<[], { pos: number }>(`SELECT COALESCE(MAX(position), -1) + 1 AS pos FROM albums`)
    .get();
  return row?.pos ?? 0;
}

function albumSlugTaken(db: Database, slug: string): boolean {
  return db.prepare(`SELECT 1 FROM albums WHERE slug = ?`).get(slug) !== undefined;
}

export interface CreateAlbumInput {
  name: string;
  slug?: string;
  description?: string;
}

/** Create an album with a random opaque id and a derived, deduped slug. */
export function createAlbum(
  _ctx: Ctx,
  input: CreateAlbumInput,
): {
  id: string;
  slug: string;
} {
  const db = getDb();
  const id = randomUUID();
  const slug = uniqueSlug(slugify(input.slug ?? input.name), (s) => albumSlugTaken(db, s));
  db.prepare(
    `INSERT INTO albums (id, slug, name, description, position)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, slug, input.name, input.description ?? null, nextAlbumPosition(db));
  return { id, slug };
}

/** Return the id of the album with `slug`, creating it (with `name`) if absent. */
export function ensureAlbum(_ctx: Ctx, slug: string, name?: string): string {
  const db = getDb();
  const existing = db
    .prepare<[string], { id: string }>(`SELECT id FROM albums WHERE slug = ?`)
    .get(slug);
  if (existing) return existing.id;

  const id = randomUUID();
  db.prepare(
    `INSERT INTO albums (id, slug, name, description, position)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, slug, name ?? slug, null, nextAlbumPosition(db));
  return id;
}

/* ------------------------------------------------------------------ *
 *  Ingestion
 * ------------------------------------------------------------------ */

export interface IngestPhotoInput {
  /** Target album slug; defaults to the "discover" album (auto-created). */
  album?: string;
  filename: string;
  title?: string;
  commentary?: string;
  /** Raw original bytes from the multipart upload. */
  data: Buffer;
}

export interface IngestResult {
  id: string;
  slug: string;
  status: "created" | "replaced";
}

/** Orientation-corrected intrinsic dimensions, without re-encoding the image. */
async function intrinsicDimensions(original: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(original).metadata();
  let width = meta.width ?? 0;
  let height = meta.height ?? 0;
  // EXIF orientations 5–8 rotate by 90°/270°, swapping the stored dimensions.
  if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
  return { width, height };
}

/**
 * Ingest (or replace, keyed on album_id + filename) a single photo: write the
 * original, extract EXIF, compute intrinsic dimensions + ThumbHash, generate
 * derivatives, then upsert the row. Replacing reuses the existing random `id`
 * (and slug) so derivative paths and `/media` URLs stay stable.
 */
export async function ingestPhoto(ctx: Ctx, input: IngestPhotoInput): Promise<IngestResult> {
  if (!input.filename || input.data.length === 0) {
    throw new Error("ingestPhoto: filename and non-empty data are required");
  }

  const db = getDb();
  const albumSlug = slugify(input.album || DEFAULT_ALBUM_SLUG);
  const albumId = ensureAlbum(
    ctx,
    albumSlug,
    albumSlug === DEFAULT_ALBUM_SLUG ? DEFAULT_ALBUM_NAME : undefined,
  );

  // Reuse the existing id + slug on replace; mint fresh ones for a new photo.
  const existing = db
    .prepare<[string, string], { id: string; slug: string }>(
      `SELECT id, slug FROM photos WHERE album_id = ? AND filename = ?`,
    )
    .get(albumId, input.filename);

  const photoId = existing?.id ?? randomUUID();
  const status: IngestResult["status"] = existing ? "replaced" : "created";
  const slug =
    existing?.slug ??
    uniqueSlug(
      slugify(parsePath(input.filename).name || input.title || input.filename),
      (s) =>
        db.prepare(`SELECT 1 FROM photos WHERE album_id = ? AND slug = ?`).get(albumId, s) !==
        undefined,
    );

  // Write the original, then derive everything from the in-memory buffer.
  const originalDir = `${paths.originals}/${photoId}`;
  await mkdir(originalDir, { recursive: true });
  await writeFile(`${originalDir}/${input.filename}`, input.data);

  const [exif, dims, thumbhash] = await Promise.all([
    extractExif(ctx, input.data),
    intrinsicDimensions(input.data),
    computeThumbHash(ctx, input.data),
    generateDerivatives(ctx, photoId, input.data),
  ]);

  // Title/commentary are user-supplied (preserve on replace when omitted); all
  // other columns are derived and recomputed every time.
  db.transaction(() => {
    db.prepare(
      `INSERT INTO photos
        (id, album_id, filename, slug, title, commentary, taken_at, width, height,
         thumbhash, camera_body, lens, focal_length, aperture, shutter, iso)
       VALUES
        (@id, @albumId, @filename, @slug, @title, @commentary, @takenAt, @width, @height,
         @thumbhash, @cameraBody, @lens, @focalLength, @aperture, @shutter, @iso)
       ON CONFLICT(album_id, filename) DO UPDATE SET
         title        = COALESCE(excluded.title, photos.title),
         commentary   = COALESCE(excluded.commentary, photos.commentary),
         taken_at     = excluded.taken_at,
         width        = excluded.width,
         height       = excluded.height,
         thumbhash    = excluded.thumbhash,
         camera_body  = excluded.camera_body,
         lens         = excluded.lens,
         focal_length = excluded.focal_length,
         aperture     = excluded.aperture,
         shutter      = excluded.shutter,
         iso          = excluded.iso`,
    ).run({
      id: photoId,
      albumId,
      filename: input.filename,
      slug,
      title: input.title ?? null,
      commentary: input.commentary ?? null,
      takenAt: exif.takenAt,
      width: dims.width,
      height: dims.height,
      thumbhash,
      cameraBody: exif.cameraBody,
      lens: exif.lens,
      focalLength: exif.focalLength,
      aperture: exif.aperture,
      shutter: exif.shutter,
      iso: exif.iso,
    });
  })();

  yearRangeCache = null;
  return { id: photoId, slug, status };
}

export async function deletePhoto(ctx: Ctx, photoId: string): Promise<void> {
  const db = getDb();
  const existing = db
    .prepare<[string], { id: string }>(`SELECT id FROM photos WHERE id = ?`)
    .get(photoId);
  if (!existing) {
    const err = new Error("Photo not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  db.transaction(() => {
    // Promote the most recently uploaded remaining photo as cover; NULL if none left.
    db.prepare(
      `UPDATE albums
       SET cover_photo_id = (
         SELECT id FROM photos
         WHERE album_id = albums.id AND id != ?
         ORDER BY created_at DESC LIMIT 1
       )
       WHERE cover_photo_id = ?`,
    ).run(photoId, photoId);
    db.prepare(`DELETE FROM photos WHERE id = ?`).run(photoId);
  })();

  yearRangeCache = null;

  const removeDir = (dir: string) =>
    rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
      ctx.log.error({ err, dir, photoId }, "deletePhoto: failed to remove directory");
    });
  await Promise.all([
    removeDir(`${paths.originals}/${photoId}`),
    removeDir(`${paths.derivatives}/${photoId}`),
  ]);
}
