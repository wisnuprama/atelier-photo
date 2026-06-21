import exifr from "exifr";

/**
 * EXIF fields pulled at ingest, formatted to the same display strings the
 * viewer/showcase already expect (see `views/showcase.ts`). Every field is
 * nullable — missing or unparseable EXIF must never fail ingest.
 */
export interface PhotoExif {
  /** DateTimeOriginal as ISO-8601, or null (sorts last via created_at tie-break). */
  takenAt: string | null;
  cameraBody: string | null;
  lens: string | null;
  focalLength: string | null;
  aperture: string | null;
  shutter: string | null;
  iso: string | null;
}

const EMPTY: PhotoExif = {
  takenAt: null,
  cameraBody: null,
  lens: null,
  focalLength: null,
  aperture: null,
  shutter: null,
  iso: null,
};

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** "Make Model", de-duplicated when Model already contains Make (e.g. "SONY ILCE-7CM2"). */
function cameraBody(make: unknown, model: unknown): string | null {
  const m = str(make);
  const mod = str(model);
  if (!mod) return m;
  if (m && mod.toLowerCase().startsWith(m.toLowerCase())) return mod;
  return [m, mod].filter(Boolean).join(" ");
}

/** FocalLength (number) → "85mm". */
function focalLength(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)}mm` : null;
}

/** FNumber (number) → "f/1.8". */
function aperture(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Drop a trailing ".0" so f/4.0 reads f/4.
  return `f/${Number.isInteger(n) ? n : n.toFixed(1)}`;
}

/** ExposureTime (seconds) → "1/250s" or "2s". */
function shutter(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1) return `${Number.isInteger(n) ? n : n.toFixed(1)}s`;
  return `1/${Math.round(1 / n)}s`;
}

function iso(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : null;
}

function takenAt(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return null;
}

/**
 * Extract and format EXIF metadata from an original image buffer. Returns all
 * nulls when the image carries no EXIF or parsing fails — ingest continues.
 */
export async function extractExif(original: Buffer): Promise<PhotoExif> {
  let data: Record<string, unknown> | undefined;
  try {
    data = (await exifr.parse(original)) as Record<string, unknown> | undefined;
  } catch {
    return EMPTY;
  }
  if (!data) return EMPTY;

  return {
    takenAt: takenAt(data.DateTimeOriginal ?? data.CreateDate),
    cameraBody: cameraBody(data.Make, data.Model),
    lens: str(data.LensModel ?? data.Lens),
    focalLength: focalLength(data.FocalLength),
    aperture: aperture(data.FNumber),
    shutter: shutter(data.ExposureTime),
    iso: iso(data.ISO),
  };
}
