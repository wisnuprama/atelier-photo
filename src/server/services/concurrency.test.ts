import { describe, expect, it } from "vitest";
import { createLimiter } from "./concurrency.js";

const defer = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createLimiter", () => {
  it("rejects a non-positive or non-integer max", () => {
    expect(() => createLimiter(0)).toThrow();
    expect(() => createLimiter(-1)).toThrow();
    expect(() => createLimiter(1.5)).toThrow();
  });

  it("never runs more than `max` tasks at once", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await defer(5);
          active--;
        }),
      ),
    );

    expect(peak).toBe(2);
  });

  it("serializes fully at max = 1", async () => {
    const limit = createLimiter(1);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 5 }, () =>
        limit(async () => {
          active++;
          peak = Math.max(peak, active);
          await defer(2);
          active--;
        }),
      ),
    );

    expect(peak).toBe(1);
  });

  it("preserves result order regardless of completion order", async () => {
    const limit = createLimiter(3);
    const results = await Promise.all(
      [30, 5, 20, 1].map((ms, i) =>
        limit(async () => {
          await defer(ms);
          return i;
        }),
      ),
    );
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("propagates rejections and keeps the slot reusable", async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // The failed task must release its slot so later work still runs.
    await expect(limit(() => Promise.resolve("ok"))).resolves.toBe("ok");
  });
});
