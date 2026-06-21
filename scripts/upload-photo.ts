/**
 * Dev helper: upload one or more photos to the admin ingest API.
 *
 * Builds the multipart/form-data body by hand so the exact bytes can be
 * HMAC-signed (curl builds the body itself, so it can't be signed beforehand —
 * see docs/wiki/adding-photos.md). Credentials come from the same env the server
 * uses: ADMIN_KEY_ID / ADMIN_HMAC_SECRET (load .env via --env-file-if-exists).
 *
 * Usage:
 *   pnpm upload <file...> [--album slug] [--title t] [--commentary c] [--url base]
 *
 * Examples:
 *   pnpm upload ./WALK_01.jpg
 *   pnpm upload ./a.jpg ./b.jpg --album night-walks --title "Night Walks"
 *   pnpm upload ./a.jpg --url http://localhost:3000
 */
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

interface Args {
  files: string[];
  album?: string;
  title?: string;
  commentary?: string;
  url: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

function parseArgs(argv: string[]): Args {
  const files: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      opts[key] = value;
    } else {
      files.push(arg);
    }
  }
  if (files.length === 0) {
    throw new Error(
      "no files given\n" +
        "usage: pnpm upload <file...> [--album slug] [--title t] [--commentary c] [--url base]",
    );
  }
  const port = process.env.PORT ?? "3000";
  return {
    files,
    album: opts.album,
    title: opts.title,
    commentary: opts.commentary,
    url: (opts.url ?? `http://localhost:${port}`).replace(/\/+$/, ""),
  };
}

function field(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
}

async function filePart(boundary: string, path: string): Promise<Buffer> {
  const data = await readFile(path);
  const filename = basename(path);
  const mime = MIME_BY_EXT[extname(filename).toLowerCase()] ?? "application/octet-stream";
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from("\r\n"),
  ]);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const keyId = process.env.ADMIN_KEY_ID;
  const secret = process.env.ADMIN_HMAC_SECRET;
  if (!keyId || !secret) {
    throw new Error(
      "ADMIN_KEY_ID / ADMIN_HMAC_SECRET not set — copy .env.example to .env or export them",
    );
  }

  const boundary = `----galleryupload${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  if (args.album) parts.push(field(boundary, "album", args.album));
  if (args.title) parts.push(field(boundary, "title", args.title));
  if (args.commentary) parts.push(field(boundary, "commentary", args.commentary));
  for (const file of args.files) parts.push(await filePart(boundary, file));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const ts = String(Date.now());
  const sig = createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");

  const endpoint = `${args.url}/admin/photos`;
  console.log(
    `Uploading ${args.files.length} file(s) to ${endpoint}${args.album ? ` (album: ${args.album})` : ""}`,
  );

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "x-key-id": keyId,
      "x-timestamp": ts,
      "x-signature": sig,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${res.status} ${res.statusText}\n${text}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${res.status}`, text);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
