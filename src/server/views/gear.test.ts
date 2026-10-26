import { describe, expect, it } from "vitest";
import type { GearItem } from "../services/gear.js";
import {
  formatPhotoCount,
  formatYears,
  gearMeta,
  gearPage,
  gearSearchHref,
  gearYearSpan,
  groupGear,
} from "./gear.js";

function item(over: Partial<GearItem> = {}): GearItem {
  return {
    kind: "camera",
    name: "SONY ILCE-7CM2",
    active: true,
    photoCount: 42,
    firstYear: 2024,
    lastYear: 2026,
    sample: { id: "ph1", width: 800, height: 533, thumbhash: "abc", title: null },
    ...over,
  };
}

/** HTML of one `<section data-gear-section="…">`, or "" when absent. */
function section(html: string, key: string): string {
  const re = new RegExp(`<section[^>]*data-gear-section="${key}"[\\s\\S]*?</section>`);
  return html.match(re)?.[0] ?? "";
}

/** HTML of one `<ul data-gear-list="…">`, or "" when absent. */
function list(html: string, key: string): string {
  const re = new RegExp(`<ul[^>]*data-gear-list="${key}"[\\s\\S]*?</ul>`);
  return html.match(re)?.[0] ?? "";
}

const MIXED: GearItem[] = [
  item({ kind: "camera", name: "A7", active: true }),
  item({ kind: "lens", name: "35mm", active: true }),
  item({ kind: "lens", name: "50mm", active: false }),
];

describe("gearPage structure", () => {
  it("splits active/inactive with camera/lens sub-groups labelled by their h3", () => {
    const html = gearPage(MIXED, false);
    expect(section(html, "active")).toContain('aria-labelledby="gear-active-title"');
    expect(section(html, "active")).toContain('<h2 id="gear-active-title"');
    expect(section(html, "active")).toContain(">In the bag</h2>");
    expect(section(html, "inactive")).toContain(">Past companions</h2>");
    expect(list(html, "active-camera")).toContain('aria-labelledby="gear-active-camera-title"');
    expect(html).toContain('<h3 id="gear-active-camera-title"');
    expect(list(html, "active-camera")).toContain('data-gear-name="A7"');
    expect(list(html, "active-lens")).toContain('data-gear-name="35mm"');
    expect(list(html, "inactive-lens")).toContain('data-gear-name="50mm"');
  });

  it("omits the inactive section and empty sub-groups for visitors", () => {
    const html = gearPage([item({ kind: "lens", name: "35mm" })], false);
    expect(section(html, "inactive")).toBe("");
    expect(list(html, "active-camera")).toBe("");
    expect(list(html, "active-lens")).not.toBe("");
    expect(html).not.toContain("data-gear-empty");
  });

  it("always renders all four lists for admins, with placeholders", () => {
    const html = gearPage([item({ kind: "lens", name: "35mm" })], true);
    for (const key of ["active-camera", "active-lens", "inactive-camera", "inactive-lens"]) {
      expect(list(html, key)).toContain("data-gear-empty");
    }
    expect(list(html, "active-camera")).toMatch(/<li data-gear-empty class="col-span-full/);
    expect(list(html, "active-lens")).toMatch(/<li data-gear-empty class="hidden /);
  });

  it("sets data-gear-order to the item's index in the input", () => {
    const html = gearPage(MIXED, false);
    expect(html).toContain('data-gear-name="A7" data-gear-order="0"');
    expect(html).toContain('data-gear-name="35mm" data-gear-order="1"');
    expect(html).toContain('data-gear-name="50mm" data-gear-order="2"');
  });

  it("renders the empty state, with the upload sentence for admins only", () => {
    const visitor = gearPage([], false);
    expect(visitor).toContain("No gear yet.</p>");
    expect(visitor).not.toContain("Upload a photo");
    expect(visitor).not.toContain("data-gear-section");
    const admin = gearPage([], true);
    expect(admin).toContain("No gear yet. Upload a photo with EXIF and it appears here.");
    expect(admin).not.toContain("data-gear-list");
    expect(admin).not.toContain('id="gearStatus"');
  });

  it("links the card to gear search and lazy-loads the sample thumb", () => {
    const html = gearPage([item({ kind: "lens", name: "FE 35mm" })], false);
    expect(html).toContain('href="/search?lens=FE+35mm"');
    expect(html).toContain('data-src="/media/ph1/thumb"');
    expect(html).toContain('width="800" height="533"');
    expect(html).toContain('data-thumbhash="abc"');
  });
});

describe("gearPage admin controls", () => {
  it("renders a checkbox only for admins, mirroring active", () => {
    expect(gearPage(MIXED, false)).not.toContain("data-gear-toggle");
    const html = gearPage(MIXED, true);
    expect(html.match(/data-gear-toggle/g)).toHaveLength(3);
    expect(list(html, "active-camera")).toContain("data-gear-toggle checked");
    expect(list(html, "inactive-lens")).toMatch(/data-gear-toggle class=/);
  });

  it("puts the checkbox label after the link, not inside it, with the name for SR", () => {
    const html = gearPage([item({ name: "A7" })], true);
    const card = html.match(/<li data-gear-item[\s\S]*?<\/li>/)?.[0] ?? "";
    const link = card.match(/<a [\s\S]*?<\/a>/)?.[0] ?? "";
    expect(link).not.toContain("<input");
    expect(card).toMatch(/<\/a>\s*<label/);
    expect(card).toContain('<span>In use<span class="sr-only"> — A7</span></span>');
  });

  it("renders the admin strip with a polite live region only for admins", () => {
    const html = gearPage(MIXED, true);
    expect(html).toMatch(
      /<span id="gearStatus" aria-live="polite"[^>]*>Tick “In use” to keep an item in the bag<\/span>/,
    );
    expect(html).toContain('action="/admin/logout"');
    expect(gearPage(MIXED, false)).not.toContain("gearStatus");
  });
});

describe("gearPage text", () => {
  it("uses the photo title as alt, else a generic alt without the name", () => {
    expect(gearPage([item({ sample: { ...item().sample, title: "Harbour" } })])).toContain(
      'alt="Harbour"',
    );
    const html = gearPage([item({ name: "A7" })]);
    expect(html).toContain('alt="Sample photograph"');
    expect(html).not.toMatch(/alt="[^"]*A7/);
  });

  it("escapes hostile names everywhere", () => {
    const name = `<img onerror=x>"'&`;
    const html = gearPage([item({ name })], true);
    expect(html).not.toContain("<img onerror");
    expect(html).toContain('data-gear-name="&lt;img onerror=x&gt;&quot;&#39;&amp;"');
    expect(html).toContain('<span class="sr-only"> — &lt;img onerror=x&gt;&quot;&#39;&amp;</span>');
    expect(html).toContain(">&lt;img onerror=x&gt;&quot;&#39;&amp;</p>");
    expect(html).toContain('href="/search?camera=%3Cimg+onerror%3Dx%3E%22%27%26"');
  });

  it("shows the year span in the eyebrow, or none when undated", () => {
    expect(gearPage(MIXED)).toContain("Cameras &amp; Lenses · 2024—2026</p>");
    const undated = gearPage([item({ firstYear: null, lastYear: null })]);
    expect(undated).toContain(">Cameras &amp; Lenses</p>");
  });

  it("renders the meta line without a separator when undated", () => {
    const html = gearPage([item({ photoCount: 7, firstYear: null, lastYear: null })]);
    expect(html).toContain(">7 photographs</p>");
  });
});

describe("gearSearchHref", () => {
  it("encodes with URLSearchParams and round-trips", () => {
    const name = "17mm F4 DG DN | Contemporary 023";
    const href = gearSearchHref("lens", name);
    expect(href).toBe("/search?lens=17mm+F4+DG+DN+%7C+Contemporary+023");
    expect(new URLSearchParams(href.split("?")[1]).get("lens")).toBe(name);
    expect(gearSearchHref("camera", "SONY ILCE-7CM2")).toBe("/search?camera=SONY+ILCE-7CM2");
  });
});

describe("pure helpers", () => {
  it("formatPhotoCount", () => {
    expect(formatPhotoCount(1)).toBe("1 photograph");
    expect(formatPhotoCount(42)).toBe("42 photographs");
  });

  it("formatYears", () => {
    expect(formatYears(2024, 2026)).toBe("2024—2026");
    expect(formatYears(2025, 2025)).toBe("2025");
    expect(formatYears(null, null)).toBe("");
    expect(formatYears(2025, null)).toBe("");
  });

  it("gearMeta", () => {
    expect(gearMeta(item())).toBe("42 photographs · 2024—2026");
    expect(gearMeta(item({ photoCount: 1, firstYear: null, lastYear: null }))).toBe("1 photograph");
  });

  it("gearYearSpan", () => {
    expect(gearYearSpan([])).toBeNull();
    expect(gearYearSpan([item({ firstYear: null, lastYear: null })])).toBeNull();
    expect(
      gearYearSpan([
        item({ firstYear: 2022, lastYear: 2023 }),
        item({ firstYear: null, lastYear: null }),
        item({ firstYear: 2021, lastYear: 2026 }),
      ]),
    ).toEqual({ first: 2021, last: 2026 });
  });

  it("groupGear keeps DAO order and records indexes", () => {
    const g = groupGear(MIXED);
    expect(g.active.camera.map((x) => [x.item.name, x.order])).toEqual([["A7", 0]]);
    expect(g.active.lens.map((x) => [x.item.name, x.order])).toEqual([["35mm", 1]]);
    expect(g.inactive.lens.map((x) => [x.item.name, x.order])).toEqual([["50mm", 2]]);
    expect(g.inactive.camera).toEqual([]);
  });
});
