import { describe, expect, it } from "vitest";
import { hashToIndex } from "./viewer.js";

describe("hashToIndex", () => {
  const ids = ["a1b2", "c3d4", "e5f6"];

  it("resolves #photo-<id> to its index", () => {
    expect(hashToIndex("#photo-a1b2", ids)).toBe(0);
    expect(hashToIndex("#photo-c3d4", ids)).toBe(1);
    expect(hashToIndex("#photo-e5f6", ids)).toBe(2);
  });

  it("returns null for an unknown id", () => {
    expect(hashToIndex("#photo-zzzz", ids)).toBeNull();
  });

  it("returns null for a missing or non-matching hash", () => {
    expect(hashToIndex("", ids)).toBeNull();
    expect(hashToIndex("#", ids)).toBeNull();
    expect(hashToIndex("#section", ids)).toBeNull();
    expect(hashToIndex("#photo-", ids)).toBeNull();
  });

  it("handles ids containing hyphens", () => {
    expect(hashToIndex("#photo-2024-summer", ["2024-summer", "x"])).toBe(0);
  });

  it("returns null against an empty id list", () => {
    expect(hashToIndex("#photo-a1b2", [])).toBeNull();
  });
});
