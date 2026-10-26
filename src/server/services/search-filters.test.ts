import { describe, expect, it } from "vitest";
import { GEAR_NAME_MAX } from "./gear.js";
import { hasFilters, parseSearchFilters, SEARCH_VALUE_MAX, searchHref } from "./search-filters.js";

describe("parseSearchFilters", () => {
  it("reads camera only, lens only, and both", () => {
    expect(parseSearchFilters({ camera: "A7" })).toEqual({ camera: "A7" });
    expect(parseSearchFilters({ lens: "35mm" })).toEqual({ lens: "35mm" });
    expect(parseSearchFilters({ camera: "A7", lens: "35mm" })).toEqual({
      camera: "A7",
      lens: "35mm",
    });
  });

  it("trims values and drops whitespace-only ones", () => {
    expect(parseSearchFilters({ lens: "  FE 35mm  " })).toEqual({ lens: "FE 35mm" });
    expect(parseSearchFilters({ lens: "   ", camera: "" })).toEqual({});
  });

  it("ignores non-string values (repeated keys, objects, numbers)", () => {
    expect(parseSearchFilters({ lens: ["a", "b"] })).toEqual({});
    expect(parseSearchFilters({ lens: { x: 1 } })).toEqual({});
    expect(parseSearchFilters({ camera: 7 })).toEqual({});
  });

  it("keeps a value of exactly the max length and drops a longer one", () => {
    expect(parseSearchFilters({ lens: "a".repeat(200) })).toEqual({ lens: "a".repeat(200) });
    expect(parseSearchFilters({ lens: "a".repeat(201) })).toEqual({});
  });

  it("ignores unknown keys and non-object queries", () => {
    expect(parseSearchFilters({ "lens[]": "a", q: "b" })).toEqual({});
    expect(parseSearchFilters(null)).toEqual({});
    expect(parseSearchFilters("lens=a")).toEqual({});
    expect(parseSearchFilters(undefined)).toEqual({});
  });

  it("keeps the value cap equal to the gear name cap", () => {
    expect(SEARCH_VALUE_MAX).toBe(GEAR_NAME_MAX);
  });
});

describe("hasFilters", () => {
  it("is true only when a filter is set", () => {
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ lens: undefined })).toBe(false);
    expect(hasFilters({ camera: "A7" })).toBe(true);
  });
});

describe("searchHref", () => {
  it("returns /search with no filters", () => {
    expect(searchHref({})).toBe("/search");
    expect(searchHref({ camera: undefined })).toBe("/search");
  });

  it("encodes spaces and | and round-trips", () => {
    const lens = "17mm F4 DG DN | Contemporary 023";
    const href = searchHref({ lens });
    expect(href).toBe("/search?lens=17mm+F4+DG+DN+%7C+Contemporary+023");
    expect(new URL(href, "http://x").searchParams.get("lens")).toBe(lens);
  });

  it("orders keys camera then lens", () => {
    expect(searchHref({ lens: "L", camera: "C" })).toBe("/search?camera=C&lens=L");
  });

  it("round-trips non-ASCII", () => {
    const camera = "Fujifilm X100V — 東京";
    const href = searchHref({ camera });
    expect(href).not.toMatch(/[^\x20-\x7e]/);
    expect(new URL(href, "http://x").searchParams.get("camera")).toBe(camera);
  });
});
