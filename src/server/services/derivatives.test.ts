import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// Hoisted above the mock factory + imports so generateDerivatives writes into a
// throwaway dir instead of the real data directory.
const { tmpRoot } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join: pjoin } = await import("node:path");
  return { tmpRoot: mkdtempSync(pjoin(tmpdir(), "derivatives-test-")) };
});

vi.mock("../config.js", () => ({
  paths: { derivatives: join(tmpRoot, "derivatives") },
}));

import sharp from "sharp";
import { consoleCtx } from "../context.js";
import {
  DERIVATIVES,
  DERIVATIVE_FORMATS,
  derivativePath,
  generateDerivatives,
} from "./derivatives.js";

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

// sharp reports an AVIF file's metadata format as its HEIF container.
const META_FORMAT: Record<string, string> = { avif: "heif", webp: "webp", jpeg: "jpeg" };

describe("generateDerivatives", () => {
  it("writes every size × format with correct dimensions and codec", async () => {
    // A wide image larger than every spec so each derivative is downscaled.
    const original = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: "#888" },
    })
      .jpeg()
      .toBuffer();

    await generateDerivatives(consoleCtx, "photo-a", original);

    for (const spec of DERIVATIVES) {
      for (const format of DERIVATIVE_FORMATS) {
        const buf = await readFile(derivativePath("photo-a", spec.name, format.ext));
        const meta = await sharp(buf).metadata();
        // Longest edge honors the spec; aspect ratio (3:2) preserved.
        expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(spec.maxEdge);
        expect(meta.format).toBe(META_FORMAT[format.ext]);
      }
    }
  });

  it("bakes EXIF orientation in exactly once (no double rotate)", async () => {
    // Portrait orientation tag (6 = rotate 90°) on a landscape 400×200 raster:
    // displayed dimensions become 200×400.
    const original = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#444" },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    await generateDerivatives(consoleCtx, "photo-b", original);

    const buf = await readFile(derivativePath("photo-b", "thumb", "jpeg"));
    const meta = await sharp(buf).metadata();
    // Oriented portrait, not enlarged (under thumb's maxEdge), no residual tag.
    expect(meta.height).toBeGreaterThan(meta.width ?? 0);
    expect(meta.orientation).toBeUndefined();
  });
});
