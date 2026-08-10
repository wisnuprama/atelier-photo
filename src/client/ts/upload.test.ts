import { describe, expect, it } from "vitest";
import { ACCEPTED_TYPES, fileError, formatBytes, MAX_FILE_BYTES } from "./upload.js";

describe("fileError", () => {
  it("accepts every supported image type", () => {
    for (const type of ACCEPTED_TYPES) {
      expect(fileError({ type, size: 1024 })).toBeNull();
    }
  });

  it("rejects unsupported types", () => {
    expect(fileError({ type: "text/plain", size: 10 })).toBe("Unsupported type");
    expect(fileError({ type: "image/heic", size: 10 })).toBe("Unsupported type");
    expect(fileError({ type: "", size: 10 })).toBe("Unsupported type");
  });

  it("rejects oversized and empty files", () => {
    expect(fileError({ type: "image/jpeg", size: MAX_FILE_BYTES + 1 })).toBe("Over 60 MB");
    expect(fileError({ type: "image/jpeg", size: MAX_FILE_BYTES })).toBeNull();
    expect(fileError({ type: "image/jpeg", size: 0 })).toBe("Empty file");
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes, and megabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(421_888)).toBe("412 KB");
    expect(formatBytes(3_355_443)).toBe("3.2 MB");
    expect(formatBytes(MAX_FILE_BYTES)).toBe("60.0 MB");
  });
});
