import { getDb } from "../db/index.js";

/* ------------------------------------------------------------------ *
 *  Domain types (camelCase view of the DB rows)
 * ------------------------------------------------------------------ */

export interface Album {
  id: string;
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
  a.id, a.name, a.description, a.cover_photo_id, a.position, a.created_at,
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

export function listAlbums(): AlbumWithCover[] {
  const rows = getDb()
    .prepare<[], AlbumRow>(
      `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN}
       ORDER BY a.position ASC, a.created_at ASC`,
    )
    .all();
  return rows.map(toAlbumWithCover);
}

export function getAlbum(id: string): AlbumWithCover | undefined {
  const row = getDb()
    .prepare<[string], AlbumRow>(
      `SELECT ${ALBUM_COLUMNS} FROM albums a ${COVER_JOIN} WHERE a.id = ?`,
    )
    .get(id);
  return row ? toAlbumWithCover(row) : undefined;
}

export function getPhoto(id: string): Photo | undefined {
  const row = getDb().prepare<[string], PhotoRow>(`SELECT * FROM photos WHERE id = ?`).get(id);
  return row ? toPhoto(row) : undefined;
}

/** Photos of an album, most recently taken first (timeline order). */
export function listPhotos(albumId: string): Photo[] {
  const rows = getDb()
    .prepare<[string], PhotoRow>(
      `SELECT * FROM photos WHERE album_id = ?
       ORDER BY taken_at DESC, created_at DESC`,
    )
    .all(albumId);
  return rows.map(toPhoto);
}

/* ------------------------------------------------------------------ *
 *  Ingestion (stub — see PLAN.md "Admin ingestion")
 * ------------------------------------------------------------------ */

export interface IngestPhotoInput {
  albumId: string;
  filename: string;
  title?: string;
  commentary?: string;
  /** Raw original bytes from the multipart upload. */
  data: Buffer;
}

export interface IngestResult {
  id: string;
  status: "stub";
}

/**
 * Ingest (or replace, keyed on album_id + filename) a single photo.
 *
 * TODO(later pass): extract EXIF (exifr), generate derivatives (sharp,
 * {@link generateDerivatives}), compute + store ThumbHash + intrinsic
 * dimensions ({@link encodeThumbHash}), then upsert the row. For now this
 * validates shape only and returns a stub result so the HMAC-protected route
 * can be exercised end-to-end.
 */
export async function ingestPhoto(input: IngestPhotoInput): Promise<IngestResult> {
  if (!input.albumId || !input.filename || input.data.length === 0) {
    throw new Error("ingestPhoto: albumId, filename and data are required");
  }
  return { id: `${input.albumId}/${input.filename}`, status: "stub" };
}
