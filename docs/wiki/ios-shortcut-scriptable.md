# Uploading from iOS with Scriptable

This is the concrete, working recipe for the "iOS Shortcut" mentioned in
[Adding photos](./adding-photos.md). It uploads photos to `POST /admin/photos`
with a valid HMAC signature — straight from the iOS share sheet.

## Why a helper app is required

Every `/admin/*` request must carry

```
X-Signature = HMAC-SHA256(ADMIN_HMAC_SECRET, "<X-Timestamp>." + <raw multipart body bytes>)
```

(see [Admin ingestion — HMAC](./admin-ingestion-hmac.md)). The signature must
cover the **exact** bytes that are sent, so the client has to build the
multipart body itself and sign those bytes.

Apple's **Shortcuts** app can do neither: it has **no HMAC or hashing action**,
and when it builds a `multipart/form-data` request it constructs the body
internally — you never see the bytes to sign them (the same reason a plain
`curl` can't sign its own body). So the signing is done in
[**Scriptable**](https://scriptable.app) — a free app that runs JavaScript with
access to file bytes, the Keychain, and raw HTTP requests. The HMAC contract on
the server is unchanged.

## What you'll set up

1. A Scriptable script (below) that builds the body, signs it, and POSTs it.
2. Either:
   - share photos **directly to the script** from the share sheet (simplest), or
   - a Shortcuts.app shortcut that hands photos to the script (for the Action
     button / Home Screen / a custom share-sheet label).

---

## 1. Install the script

1. Install **Scriptable** from the App Store.
2. Open Scriptable → tap **+** (new script) → name it **`Atelier Upload`**.
3. Replace the contents with the script in
   [The script](#the-script) below and save.
4. In the script list, long-press **Atelier Upload → Settings** and enable
   **Show in Share Sheet**. Under **Share Sheet Inputs** keep **Images** and
   **File URLs** enabled.

## 2. Configure credentials (once)

Run the script **from inside Scriptable** (tap it with no input). You'll get a
menu — choose **Set server & credentials** and enter:

- **Base URL** — e.g. `https://gallery.example.com` (no trailing slash, no
  `/admin`).
- **Key id** — your `ADMIN_KEY_ID`.
- **Secret** — your `ADMIN_HMAC_SECRET` (stored in the iOS **Keychain**, never in
  the script body).

Then use **Test connection** to confirm the server is reachable (it calls the
public `GET /api/albums`). Optionally use **Set default album** to pick a target
album slug; leave it blank to let uploads land in **Discover**.

> The secret lives in the device Keychain. The script file itself contains no
> secrets, so it's safe to back up or share the code.

## 3. Upload

From **Photos** (or Files), select one or more photos → **Share** → **Atelier
Upload**. A sheet lets you confirm the album and add an optional title /
commentary, then it signs and uploads. You'll get an alert with the result
(`created` / `replaced` counts), mirroring the API's JSON response.

Re-uploading the same photo (same filename) to the same album **replaces** it —
see [Adding photos → Replacing a photo](./adding-photos.md#replacing-a-photo).

## 4. (Optional) Drive it from a Shortcut

If you'd rather trigger it from the Shortcuts app (Action button, Home Screen,
or a renamed share-sheet entry):

1. New Shortcut → **Receive Images and Files** from Share Sheet (and Quick
   Actions).
2. Add **Run Script** (Scriptable) → **Script: Atelier Upload**, **Run in App**,
   and pass the **Shortcut Input** as the script's input.
3. Name the shortcut and enable **Show in Share Sheet**.

The script reads the passed photos via `args.fileURLs` / `args.images` exactly as
it does for a direct share.

---

## HEIC note (important for iPhone photos)

iPhones capture **HEIC** by default. The script uploads the **original bytes**
so EXIF (camera, lens, shutter, ISO) is preserved. Whether HEIC ingests depends
on your server's `sharp`/libvips build having HEIF decode — many prebuilt
binaries don't. If HEIC uploads fail server-side, the simplest fix that keeps
EXIF is to shoot JPEG:

- **Settings → Camera → Formats → Most Compatible** (captures JPEG going
  forward).

As a last resort the script offers **Convert HEIC → JPEG** in its menu/settings,
but re-encoding on-device **drops most EXIF**, so prefer "Most Compatible" if you
care about the capture data shown in the viewer.

---

## The script

Paste this verbatim into the `Atelier Upload` Scriptable script. It is
self-contained — a streaming pure-JS SHA-256/HMAC, manual multipart assembly,
and a raw `Request`. No external dependencies.

```js
// Atelier Upload — sign & POST photos to /admin/photos (HMAC-SHA256).
// Self-contained Scriptable script. Secrets live in the Keychain.

const KC = {
  base: "atelier.baseUrl",
  keyId: "atelier.keyId",
  secret: "atelier.secret",
  album: "atelier.album",
  heicToJpeg: "atelier.heicToJpeg",
};

const kcGet = (k) => (Keychain.contains(k) ? Keychain.get(k) : "");
const kcSet = (k, v) => (v ? Keychain.set(k, v) : Keychain.contains(k) && Keychain.remove(k));

// ---------- SHA-256 (streaming, byte-array based) ----------
const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function Sha256() {
  this.h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  this.block = new Array(64);
  this.blockLen = 0;
  this.msgLen = 0;
  this.w = new Array(64);
}

Sha256.prototype._compress = function () {
  const w = this.w;
  const b = this.block;
  for (let t = 0; t < 16; t++) {
    const i = t * 4;
    w[t] = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  }
  for (let t = 16; t < 64; t++) {
    const x = w[t - 15];
    const y = w[t - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
  }
  let a = this.h[0], bb = this.h[1], c = this.h[2], d = this.h[3];
  let e = this.h[4], f = this.h[5], g = this.h[6], hh = this.h[7];
  for (let t = 0; t < 64; t++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & bb) ^ (a & c) ^ (bb & c);
    const t2 = (S0 + maj) >>> 0;
    hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
  }
  this.h[0] = (this.h[0] + a) >>> 0;
  this.h[1] = (this.h[1] + bb) >>> 0;
  this.h[2] = (this.h[2] + c) >>> 0;
  this.h[3] = (this.h[3] + d) >>> 0;
  this.h[4] = (this.h[4] + e) >>> 0;
  this.h[5] = (this.h[5] + f) >>> 0;
  this.h[6] = (this.h[6] + g) >>> 0;
  this.h[7] = (this.h[7] + hh) >>> 0;
};

Sha256.prototype.update = function (bytes) {
  for (let i = 0; i < bytes.length; i++) {
    this.block[this.blockLen++] = bytes[i] & 0xff;
    if (this.blockLen === 64) {
      this._compress();
      this.blockLen = 0;
    }
  }
  this.msgLen += bytes.length;
  return this;
};

Sha256.prototype.digest = function () {
  const bits = this.msgLen * 8;
  const hi = Math.floor(bits / 4294967296);
  const lo = bits >>> 0;
  this.update([0x80]);
  while (this.blockLen !== 56) this.update([0]);
  this.update([
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff,
  ]);
  const out = [];
  for (const x of this.h) out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
  return out;
};

// HMAC-SHA256 over an array of byte-array chunks (avoids one giant concat).
function hmacSha256(keyBytes, chunks) {
  let k = keyBytes;
  if (k.length > 64) {
    const kh = new Sha256();
    kh.update(k);
    k = kh.digest();
  }
  k = k.slice();
  while (k.length < 64) k.push(0);
  const ipad = new Array(64);
  const opad = new Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  const inner = new Sha256();
  inner.update(ipad);
  for (const c of chunks) inner.update(c);
  const id = inner.digest();
  const outer = new Sha256();
  outer.update(opad);
  outer.update(id);
  return outer.digest();
}

// ---------- byte / encoding helpers ----------
const enc = (s) => Data.fromString(s).getBytes();

function bytesToHex(b) {
  let s = "";
  for (let i = 0; i < b.length; i++) {
    s += (b[i] >>> 4).toString(16) + (b[i] & 15).toString(16);
  }
  return s;
}

function sha256Hex(bytes) {
  return bytesToHex(new Sha256().update(bytes).digest());
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes) {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >>> 18) & 63] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + "=";
  }
  return out;
}

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff",
  gif: "image/gif", avif: "image/avif",
};
function mimeFor(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

function pathFromURL(u) {
  let p = String(u);
  if (p.indexOf("file://") === 0) p = p.slice("file://".length);
  try {
    return decodeURIComponent(p);
  } catch (_e) {
    return p;
  }
}

// ---------- gather input photos as {filename, mime, bytes} ----------
function gatherFiles() {
  const files = [];
  const heicToJpeg = kcGet(KC.heicToJpeg) === "1";

  const urls = (args.fileURLs && args.fileURLs.length ? args.fileURLs : []) || [];
  for (const u of urls) {
    const path = pathFromURL(u);
    let name = path.split("/").pop() || "photo.jpg";
    const data = Data.fromFile(path);
    if (!data) continue;
    const isHeic = /\.(heic|heif)$/i.test(name);
    if (isHeic && heicToJpeg) {
      const img = Image.fromData(data);
      if (img) {
        name = name.replace(/\.(heic|heif)$/i, ".jpg");
        files.push({ filename: name, mime: "image/jpeg", bytes: Data.fromJPEG(img).getBytes() });
        continue;
      }
    }
    files.push({ filename: name, mime: mimeFor(name), bytes: data.getBytes() });
  }

  // Fallback: bare images with no file URL (re-encoded to JPEG; EXIF is lost).
  // A bare Image carries no filename, so derive a STABLE one from the content
  // hash — re-sharing the same image then replaces instead of piling up
  // duplicates (the server keys replace on album + filename). Using a timestamp
  // here would create a new photo on every upload.
  if (files.length === 0 && args.images && args.images.length) {
    for (const img of args.images) {
      const bytes = Data.fromJPEG(img).getBytes();
      files.push({ filename: `atelier-${sha256Hex(bytes).slice(0, 16)}.jpg`, mime: "image/jpeg", bytes });
    }
  }
  return files;
}

// ---------- build + sign + send ----------
async function upload(files, meta) {
  const base = kcGet(KC.base).replace(/\/+$/, "");
  const keyId = kcGet(KC.keyId);
  const secret = kcGet(KC.secret);
  if (!base || !keyId || !secret) {
    throw new Error("Not configured — run the script in Scriptable and set credentials.");
  }

  const boundary = "----atelier" + Date.now().toString(16);
  let body = [];
  const field = (name, value) =>
    enc(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);

  if (meta.album) body = body.concat(field("album", meta.album));
  if (meta.title) body = body.concat(field("title", meta.title));
  if (meta.commentary) body = body.concat(field("commentary", meta.commentary));
  for (const f of files) {
    body = body.concat(
      enc(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.filename}"\r\n` +
          `Content-Type: ${f.mime}\r\n\r\n`,
      ),
    );
    body = body.concat(f.bytes);
    body = body.concat(enc("\r\n"));
  }
  body = body.concat(enc(`--${boundary}--\r\n`));

  const ts = String(Date.now());
  const sig = bytesToHex(hmacSha256(enc(secret), [enc(ts + "."), body]));

  const req = new Request(`${base}/admin/photos`);
  req.method = "POST";
  req.headers = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "X-Key-Id": keyId,
    "X-Timestamp": ts,
    "X-Signature": sig,
  };
  req.body = Data.fromBase64String(bytesToBase64(body));
  const text = await req.loadString();
  return { status: req.response.statusCode, text };
}

// ---------- UI flows ----------
async function promptMeta(files) {
  const names = files.map((f) => f.filename);
  const shown =
    names.slice(0, 4).join("\n") + (names.length > 4 ? `\n…and ${names.length - 4} more` : "");
  const a = new Alert();
  a.title = "Upload to Atelier";
  // Show the exact filename(s) — re-uploading the same name to the same album
  // replaces that photo, so this is your chance to confirm the identity.
  a.message = `${files.length} photo${files.length === 1 ? "" : "s"} — uploads as:\n${shown}`;
  a.addTextField("Album slug (blank = discover)", kcGet(KC.album));
  a.addTextField("Title (optional)", "");
  a.addTextField("Commentary (optional)", "");
  a.addAction("Upload");
  a.addCancelAction("Cancel");
  const idx = await a.presentAlert();
  if (idx === -1) return null;
  return {
    album: a.textFieldValue(0).trim(),
    title: a.textFieldValue(1).trim(),
    commentary: a.textFieldValue(2).trim(),
  };
}

async function notify(title, msg) {
  const a = new Alert();
  a.title = title;
  a.message = msg;
  a.addAction("OK");
  await a.presentAlert();
}

async function setCredentials() {
  const a = new Alert();
  a.title = "Server & credentials";
  a.addTextField("Base URL (https://…)", kcGet(KC.base));
  a.addTextField("Key id (ADMIN_KEY_ID)", kcGet(KC.keyId));
  a.addSecureTextField("Secret (ADMIN_HMAC_SECRET)", kcGet(KC.secret));
  a.addAction("Save");
  a.addCancelAction("Cancel");
  if ((await a.presentAlert()) === -1) return;
  kcSet(KC.base, a.textFieldValue(0).trim().replace(/\/+$/, ""));
  kcSet(KC.keyId, a.textFieldValue(1).trim());
  kcSet(KC.secret, a.textFieldValue(2));
  await notify("Saved", "Credentials stored in the Keychain.");
}

async function setAlbum() {
  const base = kcGet(KC.base).replace(/\/+$/, "");
  if (!base) return notify("No server", "Set the base URL first.");
  let albums = [];
  try {
    const res = await new Request(`${base}/api/albums`).loadJSON();
    albums = (res && res.albums) || [];
  } catch (e) {
    return notify("Failed", `Could not list albums: ${e.message}`);
  }
  const a = new Alert();
  a.title = "Default album";
  a.message = "Pick where uploads land by default.";
  a.addAction("Discover (clear default)");
  for (const al of albums) a.addAction(`${al.name} (${al.slug})`);
  a.addCancelAction("Cancel");
  const idx = await a.presentAlert();
  if (idx === -1) return;
  kcSet(KC.album, idx === 0 ? "" : albums[idx - 1].slug);
  await notify("Saved", idx === 0 ? "Default album cleared (Discover)." : `Default: ${albums[idx - 1].slug}`);
}

async function testConnection() {
  const base = kcGet(KC.base).replace(/\/+$/, "");
  if (!base) return notify("No server", "Set the base URL first.");
  try {
    const res = await new Request(`${base}/api/albums`).loadJSON();
    const n = (res && res.albums && res.albums.length) || 0;
    await notify("OK", `Reachable. ${n} album(s) found.`);
  } catch (e) {
    await notify("Failed", e.message);
  }
}

async function toggleHeic() {
  const on = kcGet(KC.heicToJpeg) === "1";
  kcSet(KC.heicToJpeg, on ? "" : "1");
  await notify("HEIC → JPEG", on ? "Disabled (originals kept, EXIF preserved)." : "Enabled (re-encodes; most EXIF is dropped).");
}

async function runUpload(files) {
  if (files.length === 0) return notify("Nothing to upload", "No photos were provided.");
  const meta = await promptMeta(files);
  if (!meta) return;
  try {
    const { status, text } = await upload(files, meta);
    if (status >= 200 && status < 300) {
      let summary = text;
      try {
        const j = JSON.parse(text);
        summary = `created ${j.created}, replaced ${j.replaced}`;
      } catch (_e) {}
      await notify("Uploaded ✓", summary);
    } else {
      await notify(`Failed (${status})`, text);
    }
  } catch (e) {
    await notify("Error", e.message);
  }
}

async function menu() {
  const a = new Alert();
  a.title = "Atelier Uploader";
  a.message = kcGet(KC.base) ? `Server: ${kcGet(KC.base)}` : "Not configured yet.";
  a.addAction("Upload from Files…");
  a.addAction("Set server & credentials");
  a.addAction("Set default album");
  a.addAction("Test connection");
  a.addAction(`HEIC → JPEG: ${kcGet(KC.heicToJpeg) === "1" ? "On" : "Off"}`);
  a.addCancelAction("Close");
  const idx = await a.presentAlert();
  if (idx === 0) {
    const paths = await DocumentPicker.open(["public.image"]);
    const files = [];
    for (const p of paths) {
      const data = Data.fromFile(p);
      const name = p.split("/").pop() || "photo.jpg";
      if (data) files.push({ filename: name, mime: mimeFor(name), bytes: data.getBytes() });
    }
    await runUpload(files);
  } else if (idx === 1) await setCredentials();
  else if (idx === 2) await setAlbum();
  else if (idx === 3) await testConnection();
  else if (idx === 4) await toggleHeic();
}

// ---------- entry ----------
const hasInput = (args.fileURLs && args.fileURLs.length) || (args.images && args.images.length);
if (hasInput) {
  await runUpload(gatherFiles());
} else {
  await menu();
}
Script.complete();
```

## How it maps to the server contract

- **Body**: built by hand as raw bytes (`field()` / file parts) so the signature
  covers exactly what's sent — same approach as `scripts/upload-photo.ts`.
- **Signature**: `hmacSha256(secret, [ "<ts>.", body ])` → hex, matching
  `verifyHmac` in `src/server/plugins/hmac-auth.ts`.
- **Headers**: `X-Key-Id`, `X-Timestamp` (epoch ms), `X-Signature`.
- **Fields**: `album` (slug), optional `title` / `commentary`, and one or more
  `file` parts — bulk-capable, exactly like `POST /admin/photos` expects.

## Filenames & the replace rule

The server identifies a photo by **album slug + filename**: re-uploading the same
filename to the same album **replaces** it (keeping its id/slug/URLs), and a new
filename creates a new photo — see
[Adding photos → Replacing a photo](./adding-photos.md#replacing-a-photo). So the
filename the script sends matters, and where it comes from depends on the input:

- **Shared from Photos (the normal case)** — iOS exports the asset to a temp file
  whose **basename is the capture name**, e.g. `IMG_4523.HEIC`. The temp
  *directory* changes on every share, but the server only sees the basename, and
  that's stable per photo — so re-sharing the same shot **replaces** it as you'd
  expect. Two wrinkles to know about:
  - An **edited** photo often exports as `FullSizeRender.jpg` (a different name
    than the original), so it lands as a separate photo.
  - **Screenshots / third-party apps** may use generic names like `image.jpg`;
    two such files could collide and overwrite each other in the same album.
- **Bare images with no file URL** (some share paths give a raw image, not a
  file) — there's no filename to use, so the script derives a **stable
  `atelier-<contentHash>.jpg`** from the bytes. Identical content reuses the same
  name (replaces); different content gets a new name. These uploads are
  re-encoded to JPEG, so EXIF is lost (same caveat as HEIC→JPEG).
- **Menu → "Upload from Files…"** — the **Files app name is used verbatim**, so
  this is the way to control the filename precisely (rename in Files first if you
  want a specific identity).

In every case the confirmation sheet lists the exact filename(s) that will be
sent, so you can see whether an upload will create or replace before it goes.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `401 signature mismatch` | Wrong secret, or the base URL points somewhere that rewrites the body. Re-enter credentials. |
| `401 timestamp outside the allowed window` | Device clock is off by >5 min — fix Date & Time (set automatically). |
| `415 expected multipart/form-data` | The `Content-Type` header was stripped by a proxy; check your reverse proxy passes it through. |
| `500` on HEIC files | Server `sharp` build lacks HEIF decode — shoot **Most Compatible** (JPEG) or enable **HEIC → JPEG**. See the HEIC note above. |
| Large photos take a few seconds | The HMAC is computed in pure JS on-device; this is expected for multi-MB files. |
