import { describe, expect, it } from "vitest";
import { icon, type IconName } from "./icons.js";

const ALL: IconName[] = [
  "menu",
  "arrow-left",
  "chevrons-up-down",
  "chevron-up",
  "chevron-down",
  "x",
  "info",
  "upload",
];

/** The root <svg …> opening tag of rendered markup. */
function openTag(svg: string): string {
  const match = /^<svg\b[^>]*>/.exec(svg);
  if (!match) throw new Error(`no opening <svg> tag in: ${svg.slice(0, 80)}`);
  return match[0];
}

function attrValues(tag: string, attr: string): string[] {
  const re = new RegExp(`\\s${attr}="([^"]*)"`, "g");
  return [...tag.matchAll(re)].map((m) => m[1] ?? "");
}

describe("icon", () => {
  it.each(ALL)("renders %s without the license comment, starting with <svg", (name) => {
    const svg = icon(name);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<!--");
    expect(svg).not.toContain("@license");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it.each(ALL)("applies exactly one width/height/class to %s", (name) => {
    const tag = openTag(icon(name, { size: 16, class: "w-5 h-5 text-ink" }));
    expect(attrValues(tag, "width")).toEqual(["16"]);
    expect(attrValues(tag, "height")).toEqual(["16"]);
    expect(attrValues(tag, "class")).toEqual([`lucide lucide-${name} w-5 h-5 text-ink`]);
  });

  it("defaults to 24px and keeps lucide classes when no class is requested", () => {
    const tag = openTag(icon("x"));
    expect(attrValues(tag, "width")).toEqual(["24"]);
    expect(attrValues(tag, "height")).toEqual(["24"]);
    expect(attrValues(tag, "class")).toEqual(["lucide lucide-x"]);
  });

  it("keeps the remaining lucide attributes on the root tag", () => {
    const tag = openTag(icon("menu"));
    expect(tag).toContain('viewBox="0 0 24 24"');
    expect(tag).toContain('stroke="currentColor"');
    expect(tag).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(tag).not.toContain("\n");
  });

  it("marks decorative icons aria-hidden and unfocusable", () => {
    const tag = openTag(icon("info"));
    expect(tag).toContain('aria-hidden="true" focusable="false"');
    expect(tag).not.toContain("role=");
    expect(tag).not.toContain("aria-label");
  });

  it("labels meaningful icons with an escaped aria-label", () => {
    const tag = openTag(icon("x", { label: 'a"<b' }));
    expect(tag).toContain('role="img" aria-label="a&quot;&lt;b"');
    expect(tag).not.toContain("aria-hidden");
    expect(attrValues(tag, "aria-label")).toEqual(["a&quot;&lt;b"]);
  });
});
