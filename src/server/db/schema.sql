-- Photo Gallery Web — SQLite schema.
-- Applied idempotently by migrate.ts on boot.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS albums (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  cover_photo_id TEXT,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  album_id     TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,
  title        TEXT,
  commentary   TEXT,
  taken_at     TEXT,          -- ISO-8601; drives most-recent sort
  width        INTEGER NOT NULL,
  height       INTEGER NOT NULL,
  thumbhash    TEXT,          -- base64-encoded ThumbHash for blur-up placeholder
  camera_body  TEXT,
  lens         TEXT,
  focal_length TEXT,
  aperture     TEXT,
  shutter      TEXT,
  iso          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  -- "Replace on same filename" = upsert keyed on this pair.
  UNIQUE (album_id, filename)
);

-- Timeline query: photos of an album, most recently taken first.
CREATE INDEX IF NOT EXISTS idx_photos_album_taken
  ON photos (album_id, taken_at DESC);
