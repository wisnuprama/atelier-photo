import { describe, expect, it } from "vitest";
import type { AlbumWithCover, Photo } from "../services/photos.js";
import { lightbox, viewerDataScript } from "./photo-viewer.js";
import { showcasePage } from "./showcase.js";

const album: AlbumWithCover = {
  id: "a",
  slug: "tokyo",
  name: "A & B",
  description: "Night walks",
  coverPhotoId: null,
  position: 0,
  createdAt: "2026-01-01 00:00:00",
  photoCount: 2,
  cover: null,
};

function photo(id: string, title: string | null): Photo {
  return {
    id,
    albumId: "a",
    filename: `${id}.jpg`,
    title,
    commentary: "note </script>",
    takenAt: "2025-01-02T00:00:00.000Z",
    width: 10,
    height: 20,
    thumbhash: "th",
    cameraBody: "A7",
    lens: "FE 35mm",
    focalLength: "35mm",
    aperture: "f/2",
    shutter: "1/100",
    iso: "100",
  };
}

const PHOTOS = [photo("p1", "First"), photo("p2", null)];

function island(html: string): unknown {
  const m = html.match(/<script type="application\/json" id="viewer-data">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no #viewer-data island");
  return JSON.parse(m[1]);
}

// Guards the move of lightbox()/viewerData() into views/photo-viewer.ts: the
// snapshot was taken from the pre-move showcase.ts and must stay byte-identical.
describe("showcasePage (viewer extraction regression)", () => {
  it("renders the same markup as before the move", () => {
    expect(showcasePage(album, PHOTOS)).toMatchSnapshot("visitor");
    expect(showcasePage(album, PHOTOS, true)).toMatchSnapshot("admin");
    expect(showcasePage(album, [])).toMatchSnapshot("empty");
  });

  it("embeds the shared lightbox and viewer JSON island", () => {
    const html = showcasePage(album, PHOTOS);
    expect(html).toContain(lightbox());
    expect(html).toContain(viewerDataScript(PHOTOS));
    expect(html).not.toContain('</script>"');
    expect(island(html)).toEqual([
      {
        src: "/media/p1/full",
        title: "First",
        commentary: "note </script>",
        date: "January 2, 2025",
        filename: "p1.jpg",
        camera: "A7",
        lens: "FE 35mm",
        focal: "35mm",
        aperture: "f/2",
        shutter: "1/100",
        iso: "100",
      },
      expect.objectContaining({ src: "/media/p2/full", title: "" }),
    ]);
  });

  it("keeps the viewer hooks on the album stream", () => {
    const html = showcasePage(album, PHOTOS);
    expect(html.match(/data-viewer-open data-index="\d+"/g)).toEqual([
      'data-viewer-open data-index="0"',
      'data-viewer-open data-index="1"',
    ]);
    expect(html).toContain('<figure id="photo-p1" class="photo-row" data-year="2025">');
  });
});
