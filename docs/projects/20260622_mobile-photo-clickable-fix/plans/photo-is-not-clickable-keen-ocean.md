# Fix: photo thumbnail not clickable on mobile (iOS) — fullscreen viewer won't open

## Context

On real **iOS Safari / webview**, tapping a photo thumbnail in the album grid no
longer opens the fullscreen viewer. Desktop mouse-click works fine. The user
reports this regressed after merging PR #1
(`claude/photo-fullscreen-swipe-overlay-6brt0s`, "fullscreen viewer swipe
overlay bugfix"), which replaced the lightbox's single image with a two-layer
crossfade.

Goal: make grid thumbnails reliably open the viewer on iOS, without regressing
the crossfade, and keep the change lightweight (no framework, minimal deps).

## Investigation findings (verified against source @ post-merge HEAD `33c9009`)

- Grid thumbnail markup is a native `<button ... data-viewer-open data-index="N">`
  containing `.thumbhash` + `<img.photo-img>` — see `photoRow()` in
  `src/server/views/showcase.ts:36-49`. **Unchanged by the merge.**
- Click handlers attach to every `[data-viewer-open]` in `initViewer()`
  (`src/client/ts/viewer.ts:189-191`), after the early-return guard at
  `viewer.ts:39` (`if (!lightbox || !imgA || !imgB || !stage || !panel || ...) return`).
- The merge diff (`git diff b717025..98ac330`) touched **only** the `lightbox()`
  markup internals and `viewer.ts` render()/refs. It replaced
  `<img id="lightboxImg" class="max-h-full max-w-full object-contain">` with
  `<div id="imageFrame" class="relative w-full h-full"><img id="lightboxImgA" src="" class="absolute inset-0 w-full h-full object-contain"><img id="lightboxImgB" src="" class="absolute inset-0 w-full h-full object-contain opacity-0"></div>`.
- The lightbox **container** `<div id="lightbox" class="hidden fixed inset-0 z-50 ...">`
  is unchanged and is `display:none` (`hidden`) while on the grid — so it cannot
  intercept grid taps in that state.
- Correction (from Plan agent): `src=""` is **not** new — the old single image
  also had `src=""`. The real delta is two always-present full-bleed
  `absolute inset-0 w-full h-full` imgs + an `#imageFrame` wrapper that makes the
  stage full-bleed, vs the old shrink-to-content image.
- esbuild target is `es2022` (`scripts/esbuild.js`); merge added no newer syntax.
- Desktop works ⇒ JS runs, handlers attach, lightbox is correctly hidden. So the
  failure is an **iOS/WebKit-specific** behavior, not derivable from source alone.

## Leading hypotheses (ranked)

1. **iOS synthesized-click bridge (most actionable).** Desktop fires `click`
   directly; iOS only synthesizes `click` from a clean `touchstart→touchend`.
   The merge's layout change can cause the first tap to be consumed (scroll/
   cancel) so no click is synthesized — handler attached but never invoked.
2. **New full-bleed absolute imgs change stage geometry**, triggering a WebKit
   hit-test/compositing quirk (to disprove, since `display:none` should prevent it).
3. **Empty `src=""` ×2** resolving to the document URL in WebKit (weaker — single
   img had it pre-merge and worked).
4. Old-WebKit runtime/parse break aborting `initViewer()` (low; caught by a
   `pageerror` collector during repro).

## Reproduction plan (BLOCKED on network egress — do first in new session)

Environment egress currently blocks the live site and the Playwright CDN. **Add
to the environment's network egress allowlist:**
- `still.wisnu.io` (live site)
- `cdn.playwright.dev` (Playwright WebKit download, primary)
- `playwright.download.prss.microsoft.com` (download fallback)

(`github.com` + `registry.npmjs.org` already reachable. Playwright 1.56.1 is
present; WebKit 26.0 binary is `webkit-ubuntu-24.04.zip`. `apt`/`install-deps`
may also be blocked — flag if needed.)

Then:
1. `npx playwright install webkit` (and `--with-deps` if system libs missing).
2. Drive headless WebKit with an iPhone descriptor
   (`devices['iPhone 13']`, `hasTouch: true`) and use `locator.tap()` (not
   `click()`) so touch is synthesized like iOS.
3. Open `https://still.wisnu.io`, navigate into an album, tap a
   `[data-viewer-open][data-index="0"]`, assert `#lightbox` loses `hidden` /
   becomes visible. Attach a `page.on('pageerror')` collector to catch H4.
4. **Confirm causation**: also test against a pre-merge build (e.g.
   `git worktree add /tmp/pre b717025`, build, serve, run same tap assertion) —
   expect pre-merge tap opens, post-merge tap does not.

## Recommended fix (apply after repro confirms cause)

- **Targeted**: in `lightbox()` (`src/server/views/showcase.ts:69-70`) drop the
  empty `src=""` from both imgs (render() always sets `.src` before display); if
  repro points at geometry, give `#imageFrame` non-full-bleed sizing.
- **Defensive hardening (fixes regardless of exact cause)**: in `initViewer()`
  (`src/client/ts/viewer.ts:189-191`) add a pointer/touch-tolerant open alongside
  `click` — record `pointerdown` pos/time, on `pointerup` within a small
  movement/short duration call `openViewer(...)`, debounced (`lastOpenTs`) to
  avoid double-open with the synthetic click. Mirror the existing touch
  bookkeeping style (`sY/sX/sT/sActive`, viewer.ts:215-277). Add
  `touch-action: manipulation` to the grid `<button>` in `photoRow()`.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check` pass.
- Playwright WebKit tap test: pre-fix fails, post-fix passes; no `pageerror`.
- Manual iOS Safari + in-app webview: first-tap opens viewer on multiple
  thumbnails; crossfade still animates; no double-open flash; reduced-motion path
  (viewer.ts:74-79) still instant.

## Critical files
- `src/server/views/showcase.ts` — `lightbox()` markup; `photoRow()` button.
- `src/client/ts/viewer.ts` — `initViewer()` guard + grid handler binding (189-191).
- `scripts/esbuild.js` — bundle target (only if old-WebKit support needed).
- `package.json` — optional `@playwright/test` devDep + `test:e2e` script.
