import { describe, expect, it } from "vitest";
import { parseMultipart } from "./multipart.js";

const BOUNDARY = "----vitestboundary";

function multipartBody(
  parts: Array<{ name: string; value: string | Buffer; filename?: string }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition = part.filename
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: application/octet-stream`
      : `Content-Disposition: form-data; name="${part.name}"`;
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n${disposition}\r\n\r\n`));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const HEADERS = { "content-type": `multipart/form-data; boundary=${BOUNDARY}` };

describe("parseMultipart", () => {
  it("round-trips fields and file bytes", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0x00, 0x42]);
    const body = multipartBody([
      { name: "album", value: "mountains" },
      { name: "file", value: bytes, filename: "a.jpg" },
    ]);

    const parsed = await parseMultipart(HEADERS, body);
    expect(parsed.fields).toEqual({ album: "mountains" });
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]?.filename).toBe("a.jpg");
    expect(parsed.files[0]?.data.equals(bytes)).toBe(true);
  });

  it("parses multiple file parts in order", async () => {
    const body = multipartBody([
      { name: "file", value: "one", filename: "1.jpg" },
      { name: "file", value: "two", filename: "2.jpg" },
    ]);

    const parsed = await parseMultipart(HEADERS, body);
    expect(parsed.files.map((f) => f.filename)).toEqual(["1.jpg", "2.jpg"]);
  });

  it("ignores file parts beyond the files limit", async () => {
    const body = multipartBody([
      { name: "file", value: "one", filename: "1.jpg" },
      { name: "file", value: "two", filename: "2.jpg" },
    ]);

    const parsed = await parseMultipart(HEADERS, body, { files: 1 });
    expect(parsed.files.map((f) => f.filename)).toEqual(["1.jpg"]);
  });

  it("returns empty fields and files for an empty form", async () => {
    const body = Buffer.from(`--${BOUNDARY}--\r\n`);
    const parsed = await parseMultipart(HEADERS, body);
    expect(parsed.fields).toEqual({});
    expect(parsed.files).toEqual([]);
  });
});
