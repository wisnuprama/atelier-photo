import { describe, expect, it } from "vitest";
import type { PhotoTableRow } from "../services/photos.js";
import { adminPhotosPage } from "./admin-photos.js";

function row(overrides: Partial<PhotoTableRow> = {}): PhotoTableRow {
  return {
    id: "a1b2",
    filename: "a1b2.jpg",
    albumSlug: "mountains",
    albumName: "Mountains",
    title: "Summer",
    commentary: "A quiet afternoon",
    cameraBody: null,
    lens: null,
    focalLength: "35mm",
    aperture: "f/1.8",
    shutter: "1/250s",
    iso: "100",
    coverState: null,
    ...overrides,
  };
}

/** Extract the parsed contents of the #photos-data JSON island. */
function islandData(html: string): unknown {
  const match = html.match(
    /<script type="application\/json" id="photos-data">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) throw new Error("no #photos-data island found");
  return JSON.parse(match[1]);
}

describe("adminPhotosPage", () => {
  it("renders a table with the columns in the required order", () => {
    const html = adminPhotosPage([row()]);
    const headers = [...html.matchAll(/<th[^>]*>([^<]*?)<\/th>/g)].map((m) => (m[1] ?? "").trim());
    expect(headers).toEqual(["#", "ID", "Image", "Album", "Title", "Commentary", "EXIF"]);
  });

  it("renders one row per photo", () => {
    const html = adminPhotosPage([row({ id: "p1" }), row({ id: "p2" }), row({ id: "p3" })]);
    expect([...html.matchAll(/data-row /g)]).toHaveLength(3);
  });

  it("links ID and Album to the right targets, opening in a new tab", () => {
    const html = adminPhotosPage([row({ id: "a1b2", albumSlug: "mountains" })]);
    expect(html).toContain(
      '<a href="/albums/mountains#photo-a1b2" target="_blank" rel="noopener noreferrer"',
    );
    expect(html).toContain('<a href="/albums/mountains" target="_blank" rel="noopener noreferrer"');
  });

  it("escapes title and commentary to prevent HTML breakout", () => {
    const html = adminPhotosPage([row({ title: 'Evil"><script>x', commentary: "<b>bold</b>" })]);
    expect(html).not.toContain('"><script>x');
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;x");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("emits a #photos-data island parseable back to the input rows", () => {
    const rows = [row({ id: "p1" }), row({ id: "p2" })];
    expect(islandData(adminPhotosPage(rows))).toEqual(rows);
  });

  it("renders a pinned row with the Cover badge and a Reset to auto button", () => {
    const html = adminPhotosPage([row({ coverState: "pinned" })]);
    expect(html).toMatch(/<span data-cover-badge class="font-mono[^"]*">Cover<\/span>/);
    expect(html).toMatch(/data-cover-method="DELETE"[\s\S]*?>Reset to auto<\/button>/);
  });

  it("renders an auto row with the auto badge and a Set as cover button", () => {
    const html = adminPhotosPage([row({ coverState: "auto" })]);
    expect(html).toMatch(/<span data-cover-badge class="font-mono[^"]*">Cover · auto<\/span>/);
    expect(html).toMatch(/data-cover-method="POST"[\s\S]*?>Set as cover<\/button>/);
  });

  it("hides the badge on a non-cover row", () => {
    const html = adminPhotosPage([row({ coverState: null })]);
    expect(html).toContain('<span data-cover-badge class="hidden ');
    expect(html).toMatch(/data-cover-method="POST"[\s\S]*?>Set as cover<\/button>/);
  });

  it("escapes the album name in the cover button aria-label", () => {
    const evil = 'X"><script>y';
    const pinned = adminPhotosPage([row({ albumName: evil, coverState: "pinned" })]);
    const unpinned = adminPhotosPage([row({ albumName: evil, coverState: null })]);
    for (const html of [pinned, unpinned]) {
      expect(html).not.toContain('"><script>y');
      expect(html).toContain("X&quot;&gt;&lt;script&gt;y");
    }
  });

  it("round-trips coverState through the #photos-data island", () => {
    const rows = [
      row({ id: "p1", coverState: "pinned" }),
      row({ id: "p2", coverState: "auto" }),
      row({ id: "p3", coverState: null }),
    ];
    expect(islandData(adminPhotosPage(rows))).toEqual(rows);
  });

  it("renders the sr-only cover status live region", () => {
    expect(adminPhotosPage([])).toContain(
      '<p id="photos-cover-status" class="sr-only" role="status" aria-live="polite"></p>',
    );
  });

  it("renders the table shell for an empty dataset without throwing", () => {
    const html = adminPhotosPage([]);
    expect(html).toContain("<table");
    expect(html).toContain("No photos yet");
    expect(islandData(html)).toEqual([]);
  });
});
