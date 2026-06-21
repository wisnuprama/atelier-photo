/**
 * Dev helper: create an album via the admin API (POST /admin/albums).
 *
 * Builds the multipart/form-data body by hand so the exact bytes can be
 * HMAC-signed (see docs/wiki/adding-photos.md). Credentials come from the same
 * env the server uses: ADMIN_KEY_ID / ADMIN_HMAC_SECRET (load .env via
 * --env-file-if-exists).
 *
 * Usage:
 *   pnpm dev:album <name> [--slug slug] [--description d] [--url base]
 *
 * Examples:
 *   pnpm dev:album "Night Walks"
 *   pnpm dev:album "Night Walks" --slug night-walks --description "After dark."
 */
import { createHmac } from "node:crypto";

interface Args {
  name: string;
  slug?: string;
  description?: string;
  url: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[++i];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      opts[key] = value;
    } else {
      positional.push(arg);
    }
  }
  const name = positional.join(" ").trim();
  if (!name) {
    throw new Error(
      "no name given\n" +
        "usage: pnpm dev:album <name> [--slug slug] [--description d] [--url base]",
    );
  }
  const port = process.env.PORT ?? "3000";
  return {
    name,
    slug: opts.slug,
    description: opts.description,
    url: (opts.url ?? `http://localhost:${port}`).replace(/\/+$/, ""),
  };
}

function field(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
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

  const boundary = `----galleryalbum${Date.now().toString(16)}`;
  const parts: Buffer[] = [field(boundary, "name", args.name)];
  if (args.slug) parts.push(field(boundary, "slug", args.slug));
  if (args.description) parts.push(field(boundary, "description", args.description));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  const ts = String(Date.now());
  const sig = createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex");

  const endpoint = `${args.url}/admin/albums`;
  console.log(`Creating album "${args.name}" at ${endpoint}`);

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
