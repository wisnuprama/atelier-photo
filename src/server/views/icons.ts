import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cache = new Map<string, string>();

/** All Lucide icons used across the SSR templates. */
export type IconName =
  | "menu"
  | "arrow-left"
  | "chevrons-up-down"
  | "chevron-up"
  | "chevron-down"
  | "x"
  | "info";

interface IconOptions {
  /** CSS classes applied to the <svg>. */
  class?: string;
  /** Square pixel size (sets width + height). Defaults to 24. */
  size?: number;
  /** Accessible label; when omitted the icon is marked aria-hidden. */
  label?: string;
}

function rawSvg(name: IconName): string {
  let svg = cache.get(name);
  if (svg === undefined) {
    const path = require.resolve(`lucide-static/icons/${name}.svg`);
    svg = readFileSync(path, "utf8").trim();
    cache.set(name, svg);
  }
  return svg;
}

/**
 * Inline a Lucide icon as SVG markup, with size/class/a11y attributes applied
 * to the root <svg>. No client-side icon runtime.
 */
export function icon(name: IconName, opts: IconOptions = {}): string {
  const size = opts.size ?? 24;
  const a11y = opts.label
    ? `role="img" aria-label="${opts.label}"`
    : `aria-hidden="true" focusable="false"`;
  const classAttr = opts.class ? ` class="${opts.class}"` : "";

  return rawSvg(name).replace(
    /^<svg /,
    `<svg width="${size}" height="${size}" ${a11y}${classAttr} `,
  );
}
