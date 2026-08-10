import { Readable } from "node:stream";
import type { IncomingHttpHeaders } from "node:http";
import busboy from "busboy";

/** Max buffered request body / file size for photo uploads (60 MB). */
export const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

export interface ParsedMultipart {
  fields: Record<string, string>;
  files: Array<{ filename: string; data: Buffer }>;
}

/** Parse a buffered multipart/form-data body with busboy. */
export function parseMultipart(
  headers: IncomingHttpHeaders,
  raw: Buffer,
  limits: { fileSize?: number; files?: number } = {},
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers,
      limits: { fileSize: limits.fileSize ?? MAX_UPLOAD_BYTES, files: limits.files ?? 50 },
    });
    const fields: Record<string, string> = {};
    const files: ParsedMultipart["files"] = [];

    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => files.push({ filename: info.filename, data: Buffer.concat(chunks) }));
      stream.on("error", reject);
    });
    bb.on("close", () => resolve({ fields, files }));
    bb.on("error", reject);

    Readable.from(raw).pipe(bb);
  });
}
