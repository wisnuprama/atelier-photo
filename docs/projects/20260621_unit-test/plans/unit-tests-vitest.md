# Plan: Unit Tests with Vitest

## Context

The project has no test infrastructure yet. Adding vitest unit tests for all 17 source modules (11 server-side, 6 client-side) establishes a fast feedback loop and validates correctness of the core logic — HTML escaping, HMAC auth, DB row mapping, SSR template generation, and client-side DOM interactions — without running the full server.

---

## Infrastructure Setup

### New devDependencies (pnpm add -D)

```
vitest @vitest/ui @vitest/coverage-v8 happy-dom
```

### New file: `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs"],
    conditions: ["node", "import", "module", "default"],
  },
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["src/client/**/*.test.ts", "happy-dom"]],
    include: ["src/**/*.test.ts"],
    pool: "forks",   // required: better-sqlite3 native addon can't cross worker threads
    isolate: true,
    server: {
      deps: {
        external: ["better-sqlite3", "sharp", /\.node$/],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/client/ts/main.ts",
        "src/server/db/migrate.ts",
        "src/server/db/seed.ts",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

**Why `pool: "forks"`:** each fork is a fresh process with its own module registry, giving perfect isolation for module-level singletons (`config`, `db connection`, `icons cache`) without any `vi.resetModules()` ceremony between files.

### New file: `tsconfig.test.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": ".",
    "types": ["vitest/globals"]
  },
  "include": ["src/**/*.ts", "vitest.config.ts"]
}
```

### Edit: `tsconfig.json`

Add `"src/**/*.test.ts"` to the `exclude` array so `tsc -p tsconfig.json` (build) doesn't pick up test files.

### Edit: `package.json`

Add scripts:
```json
"test":          "vitest run",
"test:watch":    "vitest",
"test:ui":       "vitest --ui",
"test:coverage": "vitest run --coverage"
```

Update:
```json
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit"
```

---

## Test File Structure

All tests are colocated as `*.test.ts` next to their source files. The `.js` → `.ts` extension remap is handled transparently by vite-node — no aliases needed.

---

## Server-Side Tests (`environment: "node"`)

### `src/server/config.test.ts`

Because `config` is evaluated at module load time, every case uses `vi.stubEnv()` + `vi.resetModules()` + dynamic `import()`.

Test cases:
- Default `port` = 3000 when `PORT` absent
- `PORT=8080` → `config.port === 8080`
- Default `host` = "0.0.0.0"
- Custom `HOST` env var
- `NODE_ENV=production` → `isProduction === true`
- Default `DATA_DIR` resolves under cwd
- Custom `DATA_DIR=/tmp/test` → `paths.db`, `paths.originals`, `paths.derivatives` all derive from it

Pattern:
```ts
beforeEach(() => { vi.resetModules(); vi.unstubAllEnvs(); });

it("reads PORT env var", async () => {
  vi.stubEnv("PORT", "8080");
  const { config } = await import("./config.js");
  expect(config.port).toBe(8080);
});
```

---

### `src/server/plugins/hmac-auth.test.ts`

Mock `../config.js` to inject known `adminKeyId`/`adminHmacSecret`. Use real `node:crypto` (no need to mock). Mock `Date.now()` for timestamp window tests.

Test cases:
1. Throws 401 "admin credentials not configured" when `adminKeyId` is empty
2. Throws 401 "admin credentials not configured" when `adminHmacSecret` is empty
3. Throws 401 "missing X-Key-Id / X-Timestamp / X-Signature" when any header absent
4. Throws 401 "unknown key id" when `x-key-id` doesn't match config
5. Throws 401 "timestamp outside the allowed window" when timestamp is stale (> 5 min old)
6. Throws 401 "timestamp outside the allowed window" when timestamp is in future (> 5 min ahead)
7. Throws 401 "signature mismatch" for correct key/timestamp but wrong signature
8. Does NOT throw for a correctly computed HMAC (happy path — compute expected with `createHmac`)

---

### `src/server/services/derivatives.test.ts`

Pure constants + one stub function — no mocks needed (can also mock `config.js` for `paths.derivatives`).

Test cases:
- `DERIVATIVES` has exactly 2 entries: `{name:"thumb", maxEdge:800}` and `{name:"full", maxEdge:2400}`
- `DERIVATIVE_NAMES` is a Set containing `"thumb"` and `"full"`
- `derivativePath("abc123", "thumb")` returns a string ending in `"abc123/thumb.webp"`
- `generateDerivatives(...)` rejects with "not implemented"

---

### `src/server/services/photos.test.ts`

Mock `../db/index.js` using `vi.hoisted()` to create the mock DB before imports.

```ts
const { mockGet, mockAll, mockPrepare, mockDb } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockAll = vi.fn();
  const mockPrepare = vi.fn(() => ({ get: mockGet, all: mockAll }));
  return { mockGet, mockAll, mockPrepare, mockDb: { prepare: mockPrepare } };
});

vi.mock("../db/index.js", () => ({ getDb: vi.fn(() => mockDb), closeDb: vi.fn() }));
```

Test cases:
- `listAlbums()` returns `[]` when db returns no rows
- `listAlbums()` maps `AlbumRow` → `AlbumWithCover` (snake_case → camelCase, `cover_id` null → `cover: null`, cover present → populated cover object with `width` fallback to 3)
- `getAlbum("x")` returns `undefined` when `mockGet` returns `undefined`
- `getAlbum("x")` returns mapped album when row found
- `getPhoto("p1")` returns `undefined` / returns `Photo` based on mock
- `listPhotos("a1")` maps `PhotoRow[]` → `Photo[]`
- `ingestPhoto({albumId:"", filename:"f", data: Buffer.alloc(1)})` throws validation error
- `ingestPhoto({albumId:"a", filename:"", data: Buffer.alloc(1)})` throws
- `ingestPhoto({albumId:"a", filename:"f", data: Buffer.alloc(0)})` throws
- `ingestPhoto` valid input → `{ id: "a/f", status: "stub" }`

---

### `src/server/services/thumbhash.test.ts`

Use real `thumbhash` library (it's a pure ESM package, no native bindings).

Test cases:
- `encodeThumbHash(rgba, w, h)` returns a non-empty base64 string
- `decodeThumbHash(base64)` returns `{ width, height, rgba }` with correct dimensions
- Roundtrip: encode then decode preserves approximate dimensions
- Works with `Uint8ClampedArray` input (same code path as canvas)

Use a simple solid-color 4×4 RGBA pixel array as test data to avoid large fixtures.

---

### `src/server/views/util.test.ts`

Pure functions, zero mocks.

`esc()` cases:
- `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`, `'` → `&#39;`
- Multiple special chars in one string
- `null` → `""`
- `undefined` → `""`
- Number input → stringified

`jsonScript()` cases:
- Serializes a plain object correctly
- `<` in string values → `<` (prevents script injection)
- Nested structures pass through intact

`mediaUrl()` cases:
- `/media/${photoId}` — variant param is present in signature but output should be checked against actual implementation
- Photo ID with URL-unsafe chars → encoded correctly

---

### `src/server/views/icons.test.ts`

Mock `node:fs` to avoid real file I/O. The `require.resolve()` call in `icons.ts` uses `createRequire(import.meta.url)` — mock `node:module` to return a fake path, or simply ensure the mock `readFileSync` matches any path.

```ts
vi.mock("node:fs", async (orig) => ({
  ...(await orig<typeof import("node:fs")>()),
  readFileSync: vi.fn(() => '<svg xmlns="…"><path d="M0 0"/></svg>'),
}));
```

Test cases:
- `icon("menu")` → contains `width="24" height="24"` (default size)
- `icon("menu", { size: 16 })` → contains `width="16" height="16"`
- No `label` → `aria-hidden="true" focusable="false"`
- `label: "Close"` → `role="img" aria-label="Close"`
- `class: "w-5"` → `class="w-5"` attribute present
- `readFileSync` called once for first call, not again for second call with same name (cache hit)

---

### `src/server/views/layout.test.ts`

No mocks needed (depends on `util.esc` and `icons.icon` which are real). If icons cause issues (require.resolve), mock `./icons.js`.

Test cases:
- Return value starts with `<!DOCTYPE html>`
- Title with `<special>` chars is escaped
- `activeNav: "albums"` → the Albums `<a>` has `aria-current="page"`
- `activeNav: null` → no `aria-current` anywhere
- `body` content appears verbatim in output
- HTML contains `<html lang="en">`

---

### `src/server/views/albums.test.ts`

No mocks (depends on `util.ts` pure functions).

Test cases:
- `albumsPage([])` → contains "No albums yet"
- `albumsPage([album])` → contains the album's name
- Album with `cover` → `<img>` tag present with `data-src`
- Album without `cover` (cover is null) → no `<img>` tag
- Album name with `<` → escaped in output
- Album with `cover.thumbhash` → `data-thumbhash` attribute on the thumbhash div

---

### `src/server/views/showcase.test.ts`

No mocks for pure logic tests. Mock `./icons.js` if `readFileSync` causes issues.

Test cases:
- `showcasePage(album, [])` → contains "No photos in this album yet"
- `showcasePage(album, photos)` → contains each photo's alt text
- The `#viewer-data` script element contains valid JSON
- `viewerData` transforms: `p.takenAt` → `date` string, null fields → `""`, `mediaUrl` produces correct src
- `displayDate("2024-03-15")` → `"March 15, 2024"`
- `displayDate(null)` → `""`
- `yearOf({ takenAt: "2023-06-01" })` → `2023`
- `yearOf({ takenAt: null })` → `0`
- Year rail in output contains each distinct year, newest first
- Album with `description` → `<p id="showcaseDesc">` present
- Album without `description` → no `<p id="showcaseDesc">`

Note: `yearOf` and `displayDate` are not exported — test them via `showcasePage` output or via the `#viewer-data` JSON.

---

### `src/server/db/index.test.ts`

Use a real temp SQLite file (not a mock) — this is cleaner than mocking `better-sqlite3`'s native module and validates that WAL mode actually works. Mock `../config.js` to point `paths.db` at `os.tmpdir()`.

```ts
vi.mock("../config.js", () => ({
  config: { /* ... */ },
  paths: { db: join(tmpdir(), `gallery-test-${process.pid}.db`), ... },
}));
```

Test cases:
- `getDb()` first call creates and returns an open database
- `getDb()` second call returns the identical instance (`toBe`)
- The database has WAL journal mode (verify with `db.pragma("journal_mode", {simple:true})`)
- The database has foreign_keys ON
- `closeDb()` closes the connection (`db.open === false`)
- After `closeDb()`, the next `getDb()` call returns a new instance (not the same as before)

`afterEach`: call `closeDb()` and `rm(tmpDbPath, {force: true})`.

---

## Client-Side Tests (`environment: "happy-dom"`)

### `src/client/ts/lazyload.test.ts`

Test cases:
- Without `IntersectionObserver` (`vi.stubGlobal("IntersectionObserver", undefined)`): images get `src` set immediately from `data-src`
- With `IntersectionObserver` present: `observe()` called for each `[data-src]` image
- When intersection callback fires with `isIntersecting: true`: image `src` set and observer disconnected
- After image decodes: `"loaded"` class added to the image element

---

### `src/client/ts/nav.test.ts`

Set up minimal HTML:
```html
<nav id="mainNav"><button id="menuBtn" aria-expanded="false" aria-label="Open menu">
  <div id="mobileMenu" class="hidden"></div></button></nav>
```

Test cases:
- `initNav()` → clicking `#menuBtn` removes `"hidden"` from `#mobileMenu`
- Second click re-adds `"hidden"` (toggle)
- `aria-expanded` toggles between `"false"` and `"true"`
- `aria-label` changes between "Open menu" and "Close menu"
- Scroll `window` by 9px → nav gets `"border-hairline"` class
- Scroll back to 0px → `"border-hairline"` removed

---

### `src/client/ts/showcase.test.ts` (client)

Set up DOM with `.photo-row` elements with `data-year` attributes and `#yearRail` with year buttons.

Test cases:
- `initShowcase()` populates year buttons in `#yearRail`
- Clicking year button scrolls to the first photo of that year
- On scroll, the year button corresponding to the topmost visible photo becomes active
- Active year mirrored to `#activeYearChip` text content

---

### `src/client/ts/thumbhash.test.ts` (client)

happy-dom returns `null` for `getContext('2d')`, which `thumbhash.ts` guards against. Test the graceful path, and use `vi.spyOn` for the canvas path.

Test cases:
- `applyThumbHashes(document)` with no `[data-thumbhash]` elements → no errors
- Element without canvas support → `data-thumbhash` is removed, no background set (guard path)
- With mocked canvas ctx → `backgroundImage` set to a `data:image/` URL
- `data-thumbhash` attribute is removed from element after processing
- Malformed hash → error caught silently, does not throw

---

### `src/client/ts/viewer.test.ts`

Set up DOM with `#lightbox`, photo trigger buttons, and `#viewer-data` JSON script element.

Test cases:
- `initViewer()` without `#viewer-data` → exits silently, no throw
- Clicking a photo `<button>` opens the lightbox (removes `hidden` class)
- `Escape` key closes the lightbox
- `ArrowRight` key advances to next photo
- `ArrowLeft` key goes to previous photo
- `ArrowRight` at last photo wraps to first (or stays — test actual behavior)
- EXIF panel toggled by info button
- With `prefers-reduced-motion: reduce` → no CSS transition class added
- Swipe left triggers next photo, swipe right triggers previous

For `prefers-reduced-motion`, use `vi.stubGlobal("matchMedia", ...)` to return `{ matches: true }`.

---

## Verification

After implementation:

1. `pnpm add -D vitest @vitest/ui @vitest/coverage-v8 happy-dom`
2. `pnpm test` — all tests pass
3. `pnpm typecheck` — both tsconfig passes pass cleanly
4. `pnpm lint` — no new oxlint errors in test files
5. `pnpm test:coverage` — coverage report meets thresholds
