import sharp from "sharp";
import { encodeThumbHash } from "../services/thumbhash.js";
import { getDb } from "./index.js";
import { migrate } from "./migrate.js";

/* ------------------------------------------------------------------ *
 *  Dev seed — enough albums/photos that SSR renders the full UI.
 *  Real images are produced by the (not-yet-built) ingest pipeline;
 *  here each photo gets a generated grayscale ThumbHash + dimensions,
 *  and the /media route serves a matching placeholder frame.
 * ------------------------------------------------------------------ */

const CAMERAS = [
  { body: "Sony α7C II", lens: "FE 35mm f/1.8" },
  { body: "Sony α7C II", lens: "FE 100-400mm GM" },
  { body: "Sony α7 IV", lens: "FE 24-70mm GM II" },
  { body: "Sony α7C II", lens: "FE 85mm f/1.4 GM" },
];
const APERTURES = ["f/1.8", "f/2.0", "f/2.8", "f/4.0", "f/5.6", "f/8.0"];
const SHUTTERS = ["1/8000s", "1/2000s", "1/500s", "1/250s", "1/125s", "1/60s", "1/15s"];
const ISOS = ["100", "200", "400", "640", "1250", "3200"];
const FOCALS = ["35mm", "85mm", "135mm", "200mm", "400mm", "24mm"];
const RATIOS: ReadonlyArray<readonly [number, number]> = [
  [1600, 1067],
  [1067, 1600],
  [1600, 1200],
  [1500, 1000],
  [1080, 1350],
];

const NOTES = [
  "Caught in passing on a slow afternoon — I kept the frame deliberately spare so the light could do the talking.",
  "",
  "One of a small series shot the same morning; this is the one that held still.",
];

interface SeedAlbum {
  id: string;
  name: string;
  prefix: string;
  description: string;
  count: number;
  titles: string[];
}

const ALBUMS: SeedAlbum[] = [
  {
    id: "cities",
    name: "Cities After Dark",
    prefix: "city",
    description:
      "Concrete, neon, and the long exposures that turn empty streets into something cinematic.",
    count: 14,
    titles: ["Crossing", "Underpass", "Late Window", "Signal", "Rooftop", "Vacancy"],
  },
  {
    id: "coast",
    name: "Coastlines",
    prefix: "coast",
    description: "Where the land gives way. Mostly first light, mostly cold.",
    count: 11,
    titles: ["Low Tide", "Headland", "Drift", "Salt", "Horizon Line", "Pier"],
  },
  {
    id: "portrait",
    name: "Portraits",
    prefix: "port",
    description: "People, held briefly still.",
    count: 9,
    titles: ["Held", "In Profile", "Studio Light", "Quiet", "Turn"],
  },
  {
    id: "mountains",
    name: "High Ground",
    prefix: "mtn",
    description: "Altitude, weather, and the patience it takes to wait one out.",
    count: 13,
    titles: ["Ridge", "Whiteout", "First Snow", "Treeline", "Saddle", "Descent"],
  },
  {
    id: "still",
    name: "Still Life",
    prefix: "still",
    description: "Ordinary objects, given a wall and a window.",
    count: 8,
    titles: ["Vessel", "Fold", "Glass", "Shadowbox", "Arrangement"],
  },
  {
    id: "streets",
    name: "Streets",
    prefix: "street",
    description: "Unposed, uninvited, the city as it actually moves.",
    count: 12,
    titles: ["Hurry", "Awning", "Reflection", "Corner", "Passing", "Queue"],
  },
];

/** Encode a grayscale diagonal-gradient ThumbHash for the given dimensions. */
async function makeThumbHash(w: number, h: number, lo: number, hi: number): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="rgb(${hi},${hi},${hi})"/>
      <stop offset="1" stop-color="rgb(${lo},${lo},${lo})"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;

  // ThumbHash requires the source be <= 100px on the longest edge.
  const scale = Math.min(100 / w, 100 / h, 1);
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const { data, info } = await sharp(Buffer.from(svg))
    .resize(tw, th, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return encodeThumbHash(new Uint8Array(data), info.width, info.height);
}

async function seed(): Promise<void> {
  migrate();
  const db = getDb();

  const insertAlbum = db.prepare(
    `INSERT INTO albums (id, name, description, cover_photo_id, position)
     VALUES (@id, @name, @description, @coverPhotoId, @position)`,
  );
  const insertPhoto = db.prepare(
    `INSERT INTO photos
      (id, album_id, filename, title, commentary, taken_at, width, height,
       thumbhash, camera_body, lens, focal_length, aperture, shutter, iso)
     VALUES
      (@id, @albumId, @filename, @title, @commentary, @takenAt, @width, @height,
       @thumbhash, @cameraBody, @lens, @focalLength, @aperture, @shutter, @iso)`,
  );

  // Idempotent reseed.
  db.exec("DELETE FROM photos; DELETE FROM albums;");

  for (const [position, album] of ALBUMS.entries()) {
    interface SeedPhoto {
      id: string;
      filename: string;
      title: string;
      commentary: string;
      takenAt: string;
      width: number;
      height: number;
      thumbhash: string;
      camera: { body: string; lens: string };
      focal: string;
      aperture: string;
      shutter: string;
      iso: string;
    }
    const photos: SeedPhoto[] = [];

    for (let i = 0; i < album.count; i++) {
      const ratio = RATIOS[i % RATIOS.length]!;
      const [w, h] = ratio;
      const year = 2026 - Math.floor(i / 4);
      const month = ((i * 5) % 12) + 1;
      const day = ((i * 7) % 27) + 1;
      const lo = 28 + ((i * 13) % 40);
      const hi = 150 + ((i * 23) % 80);
      photos.push({
        id: `${album.id}-${i}`,
        filename: `${album.prefix.toUpperCase()}_${1000 + i}.jpg`,
        title: album.titles[i % album.titles.length]!,
        commentary: NOTES[i % NOTES.length]!,
        takenAt: new Date(Date.UTC(year, month - 1, day)).toISOString(),
        width: w,
        height: h,
        thumbhash: await makeThumbHash(w, h, lo, hi),
        camera: CAMERAS[i % CAMERAS.length]!,
        focal: FOCALS[i % FOCALS.length]!,
        aperture: APERTURES[i % APERTURES.length]!,
        shutter: SHUTTERS[i % SHUTTERS.length]!,
        iso: ISOS[i % ISOS.length]!,
      });
    }

    // Most recently taken first; the first becomes the album cover.
    photos.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    const coverPhotoId = photos[0]?.id ?? null;

    insertAlbum.run({
      id: album.id,
      name: album.name,
      description: album.description,
      coverPhotoId,
      position,
    });

    for (const p of photos) {
      insertPhoto.run({
        id: p.id,
        albumId: album.id,
        filename: p.filename,
        title: p.title,
        commentary: p.commentary || null,
        takenAt: p.takenAt,
        width: p.width,
        height: p.height,
        thumbhash: p.thumbhash,
        cameraBody: p.camera.body,
        lens: p.camera.lens,
        focalLength: p.focal,
        aperture: p.aperture,
        shutter: p.shutter,
        iso: p.iso,
      });
    }
  }

  const albumCount = ALBUMS.length;
  const photoCount = (db.prepare("SELECT COUNT(*) AS n FROM photos").get() as { n: number }).n;
  console.log(`✓ seeded ${albumCount} albums, ${photoCount} photos`);
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
