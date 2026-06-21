# Fix: previous photo visible behind current photo in fullscreen viewer

## Context

When a user opens a photo in fullscreen (lightbox) mode and swipes between
photos of **different aspect ratios** (e.g. portrait → landscape), the
previously-viewed photo remains visible in the letterbox/pillarbox area
behind the current photo. The two screenshots provided show photo `19 / 24`
(a landscape crop) on screen while photo `20 / 24` (a portrait shot) is still
painted in the empty space below it.

### Root cause

The lightbox uses a **single** `<img id="lightboxImg">` element and crossfades
photos by mutating that one element:

`src/client/ts/viewer.ts` `render()` (lines 64–82):

```ts
img!.style.opacity = "0";              // start fade-out (transition: opacity .4s carries over)
const pre = new Image();
const show = () => {
  img!.src = p.src;                    // swap src MID-transition
  img!.style.transition = "opacity .4s";
  requestAnimationFrame(() => (img!.style.opacity = "1")); // fade back in
};
pre.addEventListener("load", show, { once: true });
pre.src = p.src;
```

The `src` is swapped **while an opacity transition is in flight** on the same
element. On iOS WebKit / in-app webviews, the compositor retains the
previously-decoded bitmap of the old image during this transition. Because the
element is laid out with `object-contain` (`src/server/views/showcase.ts:68`:
`max-h-full max-w-full object-contain`) and the new photo has a different
aspect ratio, the new image only paints over part of the old one — the rest of
the old (portrait) bitmap stays visible in the new (landscape) letterbox area.
The stage background is `bg-paper` (white), so there is nothing to mask it.

A single `<img>` element cannot deterministically crossfade two different
images; the reliable fix is a **two-layer crossfade** so the outgoing image is
its own element that is fully hidden once the incoming image is shown.

## Approach (recommended): two-layer crossfade

Replace the single lightbox image with two stacked `<img>` layers and
crossfade between them. Each layer fills the stage content area and uses
`object-contain`, so each photo is independently centered/letterboxed and the
outgoing layer is fully faded out (and left blank) after each transition —
eliminating any leftover paint.

### 1. Markup — `src/server/views/showcase.ts`

In `lightbox()` (around line 67–68), wrap the image in a relative,
stage-filling container holding two absolutely-positioned layers:

```html
<div id="imageStage" class="relative flex-1 flex items-center justify-center bg-paper min-h-0 touch-none px-3 sm:px-8 lg:px-10 pt-16 sm:pt-10 lg:pt-10 pb-24 sm:pb-20 lg:pb-20">
  <div id="imageFrame" class="relative w-full h-full">
    <img id="lightboxImgA" src="" alt="" class="absolute inset-0 w-full h-full object-contain" />
    <img id="lightboxImgB" src="" alt="" class="absolute inset-0 w-full h-full object-contain opacity-0" />
  </div>
  ... (swipeHint + controls bar unchanged) ...
```

Notes:
- The `relative w-full h-full` wrapper fills the **padded** content box (it is a
  normal flex child), so the absolute `inset-0` layers respect the existing
  `px/pt/pb` padding that reserves room for the bottom controls bar — matching
  current behavior.
- `w-full h-full object-contain` gives each layer a stable full-stage box; the
  photo is contained/centered inside it. Aspect-ratio changes no longer resize
  the element box.

### 2. Logic — `src/client/ts/viewer.ts`

- In `initViewer()`, grab both layers instead of the single `img`:
  - `const layers = [byId("lightboxImgA"), byId("lightboxImgB")] as HTMLImageElement[]`
  - track `let front = 0;` (index of the currently-visible layer).
- Rewrite `render()` to crossfade between layers:
  - **reduce-motion path:** set the front layer's `src`/`alt`/`opacity:1` and
    the back layer's `opacity:0` (no transition) — keep behavior instant.
  - **animated path:**
    1. `const back = layers[front ^ 1];`
    2. Preload via `const pre = new Image()` (existing pattern). On `load`/`error`:
       - `back.src = p.src; back.alt = p.title || "Photograph";`
       - optionally `await back.decode().catch(() => {})` for a clean swap.
       - set transition on both layers (`opacity .4s`), then on the next
         `requestAnimationFrame` set `back.style.opacity = "1"` and
         `layers[front].style.opacity = "0"`.
       - flip `front ^= 1`.
  - Keep the existing EXIF/title/date/count update logic unchanged (it does not
    depend on the image element).
- Update the guard at line 33–38: replace the single `img` null-check with a
  check that both layers exist.
- The `alt` text must live on whichever layer is currently front (set it when
  assigning `src`).

This keeps the lightweight, no-framework approach (two `<img>` + a few lines of
state) and produces a true crossfade with no residual previous-photo paint.

### Critical files
- `src/server/views/showcase.ts` — `lightbox()` markup (img → two layers).
- `src/client/ts/viewer.ts` — `initViewer()` element refs + `render()` crossfade.
- No CSS change required (`src/client/css/app.css` `.lightbox` rule untouched;
  opacity transitions are applied inline as today). `prefers-reduced-motion`
  global rule (lines 122–133) already neutralizes transitions.

## Verification

1. `pnpm typecheck` and `pnpm lint` pass.
2. `pnpm dev`, open an album with mixed portrait/landscape photos, enter
   fullscreen.
3. Swipe (and use ↑/↓ arrows + the prev/next buttons) repeatedly between a
   portrait and a landscape photo. Confirm the previous photo is **never**
   visible behind/around the current one, in both directions.
4. Verify the crossfade still looks smooth and the EXIF panel / counter
   (`NN / NN`) update correctly.
5. Test on an iOS device / Safari (or responsive webview) since the artifact is
   WebKit-specific; confirm the letterbox area shows only `bg-paper`.
6. With OS "Reduce Motion" enabled, confirm photos switch instantly with no
   ghosting.
