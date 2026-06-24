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

type FileStatus = "pending" | "uploading" | "done" | "failed";

interface FileState {
  name: string;
  status: FileStatus;
  detail: string;
}

const BATCH_SIZE = 10;

function renderStatus(states: FileState[], done: number, total: number): void {
  const lines = states.map(({ name, status, detail }) => {
    const icon =
      status === "pending" ? "·" : status === "uploading" ? "⟳" : status === "done" ? "✓" : "✗";
    return `  ${icon} ${name}${detail ? `  ${detail}` : ""}`;
  });
  process.stdout.write(lines.join("\n") + `\n\n  ${done}/${total} complete\n`);
}

function clearLines(n: number): void {
  for (let i = 0; i < n; i++) {
    process.stdout.write("\x1b[1A\x1b[2K");
  }
}

async function uploadOne(
  file: string,
  args: Args,
  keyId: string,
  secret: string,
  state: FileState,
  onUpdate: () => void,
): Promise<boolean> {
  state.status = "uploading";
  onUpdate();

  const boundary = `----galleryupload${Date.now().toString(16)}`;
  const parts: Buffer[] = [];
  if (args.album) parts.push(field(boundary, "album", args.album));
  if (args.title) parts.push(field(boundary, "title", args.title));
  if (args.commentary) parts.push(field(boundary, "commentary", args.commentary));
  parts.push(await filePart(boundary, file));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const ts = String(Date.now());
  const sig = createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");

  const endpoint = `${args.url}/admin/photos`;
  try {
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
      state.status = "failed";
      state.detail = `${res.status} ${res.statusText} — ${text.trim()}`;
      onUpdate();
      return false;
    }
    state.status = "done";
    state.detail = `${res.status}`;
    onUpdate();
    return true;
  } catch (err) {
    state.status = "failed";
    state.detail = err instanceof Error ? err.message : String(err);
    onUpdate();
    return false;
  }
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

  const total = args.files.length;
  const endpoint = `${args.url}/admin/photos`;
  console.log(
    `Uploading ${total} file(s) to ${endpoint}${args.album ? ` (album: ${args.album})` : ""}\n`,
  );

  let totalDone = 0;
  let totalFailed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = args.files.slice(i, i + BATCH_SIZE);
    const states: FileState[] = batch.map((f) => ({
      name: basename(f),
      status: "pending",
      detail: "",
    }));

    // lines rendered = states.length rows + 1 blank + 1 progress = states.length + 2
    const lineCount = states.length + 2;
    let rendered = false;

    const redraw = () => {
      if (rendered) clearLines(lineCount);
      renderStatus(
        states,
        totalDone + states.filter((s) => s.status === "done" || s.status === "failed").length,
        total,
      );
      rendered = true;
    };

    redraw();

    const results = await Promise.allSettled(
      batch.map((file, j) => uploadOne(file, args, keyId, secret, states[j], redraw)),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) totalDone++;
      else totalFailed++;
    }

    // final redraw for this batch with accurate totals
    clearLines(lineCount);
    renderStatus(states, totalDone, total);
  }

  console.log();
  if (totalFailed > 0) {
    console.error(`${totalFailed} file(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All ${totalDone} file(s) uploaded successfully.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
