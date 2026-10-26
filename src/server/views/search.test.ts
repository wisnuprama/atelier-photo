import { describe, expect, it } from "vitest";
import type { SearchPhoto } from "../services/photos.js";
import { searchHref } from "../services/search-filters.js";
import { searchPage, searchTitle } from "./search.js";

const SIGMA = "17mm F4 DG DN | Contemporary 023";

function photo(over: Partial<SearchPhoto> = {}): SearchPhoto {
  return {
    id: "p1",
    albumId: "a1",
    albumSlug: "tokyo",
    albumName: "Tokyo Nights",
    filename: "p1.jpg",
    title: "Crossing",
    commentary: null,
    takenAt: "2025-03-01T00:00:00.000Z",
    width: 800,
    height: 533,
    thumbhash: "hash1",
    cameraBody: "A7",
    lens: SIGMA,
    focalLength: "17mm",
    aperture: "f/4",
    shutter: "1/100",
    iso: "100",
    ...over,
  };
}

const THREE = [
  photo({ id: "p1" }),
  photo({ id: "p2", title: null, thumbhash: null, albumSlug: "kyoto", albumName: "Kyoto" }),
  photo({ id: "p3", title: "Rain" }),
];

function island(html: string): unknown[] {
  const m = html.match(/<script type="application\/json" id="viewer-data">([\s\S]*?)<\/script>/);
  if (!m?.[1]) throw new Error("no #viewer-data island");
  return JSON.parse(m[1]) as unknown[];
}

function h1(html: string): string {
  return html.match(/<h1 id="searchTitle"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "";
}

function chipsHtml(html: string): string {
  return html.match(/<ul aria-label="Active filters"[\s\S]*?<\/ul>/)?.[0] ?? "";
}

describe("searchPage — results", () => {
  const html = searchPage(THREE, { lens: SIGMA });

  it("puts the count in the heading", () => {
    expect(h1(html)).toBe("3 Photographs");
    expect(h1(searchPage([photo()], { lens: SIGMA }))).toBe("1 Photograph");
  });

  it("links back to /gear", () => {
    expect(html).toMatch(/<a href="\/gear" class="inline-flex[^"]*"[^>]*>[\s\S]*?Gear\s*<\/a>/);
  });

  it("wires the viewer hooks in result order", () => {
    expect(html.match(/data-viewer-open data-index="\d+"/g)).toEqual([
      'data-viewer-open data-index="0"',
      'data-viewer-open data-index="1"',
      'data-viewer-open data-index="2"',
    ]);
    for (const id of ["p1", "p2", "p3"]) {
      expect(html).toMatch(
        new RegExp(
          `<figure id="photo-${id}" class="flex flex-col">\\s*<button[^>]*data-viewer-open`,
        ),
      );
    }
    // .photo-row is on the buttons only (one per photo), never on the figure.
    const rows = html.match(/<[a-z]+ class="[^"]*\bphoto-row\b[^"]*"/g) ?? [];
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.startsWith("<button")).toBe(true);
      expect(r).toContain("photo-tile");
      expect(r).toContain("aspect-square");
    }
    expect(html).toContain('id="lightbox"');
    const data = island(html) as { src: string }[];
    expect(data.map((d) => d.src)).toEqual(["/media/p1/full", "/media/p2/full", "/media/p3/full"]);
  });

  it("renders lazy, square-cropped images with alt text", () => {
    expect(html.match(/object-cover/g)).toHaveLength(3);
    expect(html).toContain('data-src="/media/p1/medium"');
    expect(html).toContain('data-srcset="/media/p1/thumb 800w, /media/p1/medium 1600w"');
    expect(html).toContain(
      'sizes="(min-width: 1400px) 322px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"',
    );
    expect(html).toContain('alt="Crossing"');
    expect(html).toContain('alt="Photograph"');
    expect(html).toContain('aria-label="View Photograph full screen"');
    expect(html).toContain('data-thumbhash="hash1"');
    expect(html.match(/data-thumbhash=/g)).toHaveLength(2);
  });

  it("has no admin, year-rail or per-tile aspect-ratio hooks", () => {
    expect(html).not.toContain("data-admin-photo");
    expect(html).not.toContain("data-year");
    expect(html).not.toContain("showcaseView");
    expect(html).not.toContain('style="aspect-ratio');
  });

  it("captions each tile with a link to its album top", () => {
    expect(html).toContain('href="/albums/kyoto"');
    expect(html).toMatch(
      /<a href="\/albums\/tokyo"[^>]*>\s*<span class="sr-only">Album: <\/span>Tokyo Nights\s*<\/a>/,
    );
    expect(html).not.toContain("/albums/tokyo#");
  });

  it("is a list labelled by the heading", () => {
    expect(html).toContain('<section aria-labelledby="searchTitle"');
    expect(html).toContain('<ul id="searchGrid"');
  });
});

describe("searchPage — filter chips", () => {
  it("renders one chip per filter, Camera before Lens, with remove links", () => {
    const filters = { camera: "A7", lens: SIGMA };
    const chips = chipsHtml(searchPage(THREE, filters));
    expect(chips.indexOf(">Camera<")).toBeGreaterThan(-1);
    expect(chips.indexOf(">Camera<")).toBeLessThan(chips.indexOf(">Lens<"));
    expect(chips).toContain(`>${SIGMA}</span>`);
    expect(chips).toContain(`aria-label="Remove filter Lens: ${SIGMA}"`);
    expect(chips).toContain(`href="${searchHref({ camera: "A7" })}"`);
    expect(chips).toContain(`href="${searchHref({ lens: SIGMA })}"`);
    expect(chips).toContain('<a href="/search" class="font-mono');
    expect(chips).toContain("Clear all");
  });

  it("omits Clear all with a single filter", () => {
    const chips = chipsHtml(searchPage(THREE, { lens: SIGMA }));
    expect(chips).toContain('href="/search"'); // removing the only filter
    expect(chips).not.toContain("Clear all");
    expect(chips.match(/<li/g)).toHaveLength(1);
  });
});

describe("searchPage — empty states", () => {
  it("no filter: invites browsing gear, no chips or viewer", () => {
    const html = searchPage([], {});
    expect(h1(html)).toBe("Search by gear");
    expect(html).toContain("Choose a camera or a lens to see every photograph made with it");
    expect(html).toMatch(
      /<a href="\/gear" class="mt-6[^>]*>\s*Browse my gear [\s\S]*?lucide-arrow-right/,
    );
    expect(html).not.toContain("Active filters");
    expect(html).not.toContain('id="lightbox"');
    expect(html).not.toContain('id="viewer-data"');
    expect(html).not.toContain('id="searchGrid"');
  });

  it("no match: keeps the chips, no grid or viewer", () => {
    const html = searchPage([], { lens: "Unknown" });
    expect(h1(html)).toBe("No photographs");
    expect(chipsHtml(html)).toContain("Unknown");
    expect(html).toContain("Nothing matches this gear yet.");
    expect(html).toContain("Browse my gear");
    expect(html).toMatch(/<a href="\/gear" class="inline-flex/);
    expect(html).not.toContain('id="lightbox"');
    expect(html).not.toContain('id="viewer-data"');
    expect(html).not.toContain('id="searchGrid"');
  });
});

describe("searchPage — escaping", () => {
  it("escapes filter values, album names and titles", () => {
    const evil = '"><script>x';
    const html = searchPage(
      [photo({ albumName: "<b>", title: "t </script><script>alert(1)</script>" })],
      { camera: evil },
    );
    expect(html).not.toContain(evil);
    expect(html).toContain("&quot;&gt;&lt;script&gt;x</span>");
    expect(html).toContain('aria-label="Remove filter Camera: &quot;&gt;&lt;script&gt;x"');
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
    // jsonScript escapes `<`, so the island still parses and holds the raw title.
    expect(island(html)).toEqual([
      expect.objectContaining({ title: "t </script><script>alert(1)</script>" }),
    ]);
  });
});

describe("searchTitle", () => {
  it("returns raw text for layout() to escape", () => {
    expect(searchTitle({ lens: "A & B" })).toBe("A & B — Still");
    expect(searchTitle({ camera: "Sony A7 IV", lens: "FE 35mm" })).toBe(
      "Sony A7 IV · FE 35mm — Still",
    );
    expect(searchTitle({})).toBe("Search — Still");
  });
});
