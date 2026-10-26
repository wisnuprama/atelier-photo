import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  config: { umamiWebsiteId: "" },
}));

import { layout } from "./layout.js";

/** Inner HTML of the desktop and mobile `<nav>` elements, in that order. */
function navs(html: string): { desktop: string; mobile: string } {
  const all = [...html.matchAll(/<nav[^>]*>([\s\S]*?)<\/nav>/g)].map((m) => m[1] ?? "");
  return { desktop: all[0] ?? "", mobile: all[1] ?? "" };
}

describe("layout nav", () => {
  it("has a Gear link in both navs", () => {
    const { desktop, mobile } = navs(layout({ title: "t", body: "" }));
    expect(desktop).toMatch(/<a href="\/gear"[^>]*>Gear<\/a>/);
    expect(mobile).toMatch(/<a href="\/gear"[^>]*>Gear<\/a>/);
  });

  it("marks only the active link as current, on desktop and mobile", () => {
    const { desktop, mobile } = navs(layout({ title: "t", body: "", activeNav: "gear" }));
    for (const nav of [desktop, mobile]) {
      expect(nav.match(/aria-current="page"/g)).toHaveLength(1);
      expect(nav).toMatch(/<a href="\/gear" class="[^"]*text-ink" aria-current="page">Gear<\/a>/);
    }
    expect(mobile).toContain('<a href="/" class="text-left text-stone">Albums</a>');
  });

  it("marks nothing current without activeNav", () => {
    const html = layout({ title: "t", body: "" });
    expect(html).not.toContain("aria-current");
  });
});
