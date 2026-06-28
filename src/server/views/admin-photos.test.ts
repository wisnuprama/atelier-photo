import { describe, expect, it } from "vitest";
import type { PhotoTableRow } from "../services/photos.js";
import { adminPhotosPage } from "./admin-photos.js";

function row(overrides: Partial<PhotoTableRow> = {}): PhotoTableRow {
  return {
    id: "a1b2",
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

  it("renders the table shell for an empty dataset without throwing", () => {
    const html = adminPhotosPage([]);
    expect(html).toContain("<table");
    expect(html).toContain("No photos yet");
    expect(islandData(html)).toEqual([]);
  });
});
