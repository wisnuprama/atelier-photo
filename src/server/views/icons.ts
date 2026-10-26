import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { esc } from "./util.js";

const require = createRequire(import.meta.url);

/** All Lucide icons used across the SSR templates. */
export type IconName =
  | "menu"
  | "arrow-left"
  | "arrow-right"
  | "chevrons-up-down"
  | "chevron-up"
  | "chevron-down"
  | "x"
  | "info"
  | "upload";

interface IconOptions {
  /** CSS classes applied to the <svg>. */
  class?: string;
  /** Square pixel size (sets width + height). Defaults to 24. */
  size?: number;
  /** Accessible label; when omitted the icon is marked aria-hidden. */
  label?: string;
}

interface ParsedSvg {
  /** Attributes of the root <svg> minus width/height/class, e.g. ` xmlns="…" viewBox="…"`. */
  attrs: string;
  /** Lucide's own classes from the source file (e.g. `lucide lucide-x`). */
  baseClass: string;
  /** Everything after the opening tag's `>` (children + `</svg>`). */
  rest: string;
}

const cache = new Map<IconName, ParsedSvg>();

/**
 * Read a lucide-static SVG and split its root tag. lucide-static ships each
 * file with a leading `<!-- @license … -->` comment and the `<svg` attributes
 * on separate lines, so the source is normalised here once and cached.
 */
function parsedSvg(name: IconName): ParsedSvg {
  let parsed = cache.get(name);
  if (parsed === undefined) {
    const path = require.resolve(`lucide-static/icons/${name}.svg`);
    const source = readFileSync(path, "utf8")
      .replace(/^\s*(?:<!--[\s\S]*?-->\s*)*/, "")
      .trim();
    const match = /^<svg\b([^>]*)>([\s\S]*)$/.exec(source);
    if (!match) throw new Error(`Unexpected SVG format for lucide icon "${name}"`);
    const [, rawAttrs = "", rest = ""] = match;
    let baseClass = "";
    const attrs = rawAttrs
      .replace(/\s+(width|height|class)\s*=\s*"([^"]*)"/g, (_m, attr: string, value: string) => {
        if (attr === "class") baseClass = value.trim();
        return "";
      })
      .replace(/\s+/g, " ")
      .trimEnd();
    parsed = { attrs, baseClass, rest };
    cache.set(name, parsed);
  }
  return parsed;
}

/**
 * Inline a Lucide icon as SVG markup, with size/class/a11y attributes applied
 * to the root <svg>. No client-side icon runtime.
 *
 * The source file's own width/height are replaced by the requested size, and
 * lucide's `lucide lucide-<name>` classes are kept, merged with `opts.class`
 * into a single class attribute (duplicate attributes would be ignored by the
 * browser, which keeps the first occurrence).
 */
export function icon(name: IconName, opts: IconOptions = {}): string {
  const { attrs, baseClass, rest } = parsedSvg(name);
  const size = opts.size ?? 24;
  const a11y = opts.label
    ? `role="img" aria-label="${esc(opts.label)}"`
    : `aria-hidden="true" focusable="false"`;
  const classes = [baseClass, opts.class ?? ""].filter(Boolean).join(" ");
  const classAttr = classes ? ` class="${esc(classes)}"` : "";

  return `<svg width="${size}" height="${size}" ${a11y}${classAttr}${attrs}>${rest}`;
}
