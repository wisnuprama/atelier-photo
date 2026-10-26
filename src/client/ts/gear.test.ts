import { describe, expect, it } from "vitest";
import { insertIndex, moveMessage, targetListKey, toggleRequest } from "./gear.js";

describe("toggleRequest", () => {
  it("builds a JSON POST to /admin/gear/active with credentials", () => {
    const { url, init } = toggleRequest("lens", "17mm F4 DG DN | Contemporary 023", false);
    expect(url).toBe("/admin/gear/active");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      kind: "lens",
      name: "17mm F4 DG DN | Contemporary 023",
      active: false,
    });
  });
});

describe("targetListKey", () => {
  it("combines section and kind", () => {
    expect(targetListKey("lens", true)).toBe("active-lens");
    expect(targetListKey("camera", false)).toBe("inactive-camera");
  });
});

describe("moveMessage", () => {
  it("names the destination section", () => {
    expect(moveMessage("FE 35mm", true)).toBe("FE 35mm moved to In the bag");
    expect(moveMessage("FE 35mm", false)).toBe("FE 35mm moved to Past companions");
  });
});

describe("insertIndex", () => {
  it("returns 0 for an empty list", () => {
    expect(insertIndex([], 3)).toBe(0);
  });
  it("returns 0 when smaller than all", () => {
    expect(insertIndex([2, 5, 9], 1)).toBe(0);
  });
  it("returns the first greater index when in between", () => {
    expect(insertIndex([2, 5, 9], 6)).toBe(2);
  });
  it("returns the length when larger than all", () => {
    expect(insertIndex([2, 5, 9], 12)).toBe(3);
  });
});
