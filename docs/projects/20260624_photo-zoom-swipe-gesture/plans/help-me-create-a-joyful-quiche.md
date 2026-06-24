# Photo Zoom with Swipe Gesture Guard

## Context

The fullscreen viewer currently supports vertical swipe (up = next, down = prev) as the
primary navigation gesture. There is no way to zoom into a photo to inspect detail. Adding
zoom without guarding the swipe handler would make panning an already-zoomed image
incorrectly trigger photo navigation — so the two features must be implemented together.

The goal is a natural, familiar zoom experience (pinch on mobile, scroll wheel on desktop,
double-tap to toggle) where the navigation swipe is silently disabled while zoomed in, and
re-enabled the moment the user zooms back out to 1×.

---

## Scope

**In scope**
- Pinch-to-zoom (two-finger touch) on mobile
- Scroll-wheel zoom on desktop (plain scroll _and_ ctrl+scroll / trackpad pinch, which
  browsers report as wheel events)
- Double-tap to zoom to 2× centered on the tap point; second double-tap resets to 1×
- Pan/drag while zoomed (single-finger drag moves the image; clamped to image bounds)
- Swipe navigation disabled when `scale > 1`
- Keyboard zoom: `+`/`=` in, `-` out, `0` reset
- `Escape` resets zoom first (if zoomed), closes viewer on second press
- `prefers-reduced-motion`: instant transform changes (no smooth transition)
- Zoom resets to 1× whenever `next()` / `prev()` is called

**Out of scope**
- Zoom controls in the toolbar (pinch/scroll are sufficient)
- Animated zoom-to-fit on viewer open

---

## Implementation

### Files to modify

| File | Change |
|------|--------|
| `src/client/ts/viewer.ts` | All gesture + zoom state logic |
| `src/server/views/showcase.ts` | Add `overflow-hidden` to `#imageStage` |
| `src/client/css/app.css` | CSS transition for smooth zoom (motion-safe) |

### 1. Zoom state (`viewer.ts`)

Add near the top of `initViewer()`, alongside existing state vars:

```ts
let scale = 1;
let tx = 0;          // screen-space pan offset (px)
let ty = 0;
const MIN_SCALE = 1;
const MAX_SCALE = 5;
```

Add helper functions:

```ts
function clampPan(s: number, rawTx: number, rawTy: number): [number, number] {
  // imageFrame fills stage; transform-origin = center.
  // Maximum offset = (s - 1) * half-dimension
  const halfW = stage!.clientWidth / 2;
  const halfH = stage!.clientHeight / 2;
  const maxX = Math.max(0, (s - 1) * halfW);
  const maxY = Math.max(0, (s - 1) * halfH);
  return [
    Math.max(-maxX, Math.min(maxX, rawTx)),
    Math.max(-maxY, Math.min(maxY, rawTy)),
  ];
}

function applyTransform(animated = false): void {
  const frame = document.getElementById("imageFrame");
  if (!frame) return;
  if (!reduceMotion && animated) {
    frame.style.transition = "transform 0.25s ease";
  } else {
    frame.style.transition = "none";
  }
  frame.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function resetZoom(animated = false): void {
  scale = 1; tx = 0; ty = 0;
  applyTransform(animated);
}
```

`resetZoom()` is called from:
- `next()` and `prev()` (instant, no animation)
- Keyboard `Escape` if `scale > 1` (animated)
- Double-tap at 1× (animated)

### 2. Modify `next()` / `prev()` / `close()`

```ts
function next(): void {
  resetZoom();
  index = (index + 1) % photos.length;
  render();
}
function prev(): void {
  resetZoom();
  index = (index - 1 + photos.length) % photos.length;
  render();
}
```

Keyboard Escape: if `scale > 1`, call `resetZoom(true)` and `return` before calling `close()`.

### 3. Swipe guard (`viewer.ts` — `touchend` handler)

The `decisive` check gains one more condition:

```ts
const decisive =
  sActive &&
  !sheetOpen &&
  scale === 1 &&                           // ← new: no swipe nav while zoomed
  Math.abs(dy) > Math.abs(dx) * 1.2 &&
  Math.abs(dy) > 50 &&
  (Math.abs(dy) / dt > 0.3 || Math.abs(dy) > 130);
```

### 4. Touch handling restructure (`viewer.ts`)

The single `touchstart/touchmove/touchend` block is replaced with a unified handler that
branches on touch count. Keep the existing iOS-hardening intent: non-passive `touchmove`,
edge-zone guard, `preventDefault` for vertical pans.

**State variables added alongside swipe state:**

```ts
// Pinch state
let pinchDist0 = 0;   // initial finger distance
let pinchScale0 = 1;  // scale at pinch start
let pinchCx = 0;      // centroid x at pinch start (relative to frame center)
let pinchCy = 0;
let pinchTx0 = 0;
let pinchTy0 = 0;

// Double-tap
let lastTapT = 0;
let lastTapX = 0;
let lastTapY = 0;

// Pan (single-touch while zoomed)
let panStartX = 0;
let panStartY = 0;
let panTx0 = 0;
let panTy0 = 0;
let isPanning = false;
```

**`touchstart`** (non-passive to allow `preventDefault` in move):

```
if (e.touches.length === 2) {
  // begin pinch — cancel any ongoing swipe/pan
  compute pinchDist0 (distance between two touches)
  compute centroid relative to stage center → (pinchCx, pinchCy)
  store pinchScale0 = scale, pinchTx0 = tx, pinchTy0 = ty
  sY = null (cancel swipe tracking)
  isPanning = false
} else if (e.touches.length === 1) {
  if (scale > 1) {
    // begin pan
    isPanning = true
    panStartX = touch.clientX, panStartY = touch.clientY
    panTx0 = tx, panTy0 = ty
    sY = null (no swipe while panning)
  } else {
    // swipe tracking (existing logic)
    sActive = ...; sY = ...; sX = ...; sT = ...
  }
}
```

**`touchmove`** (non-passive):

```
if (e.touches.length === 2) {
  e.preventDefault()
  newDist = distance(touch0, touch1)
  newScale = clamp(pinchScale0 * newDist / pinchDist0, MIN_SCALE, MAX_SCALE)
  // adjust translation so centroid stays fixed under fingers:
  // The centroid in screen space was (stageCenterX + pinchCx, stageCenterY + pinchCy)
  // tx_new = pinchTx0 + pinchCx * (pinchScale0 - newScale) / ... (see math below)
  [tx, ty] = clampPan(newScale, adjustedTx, adjustedTy)
  scale = newScale
  applyTransform()
} else if (e.touches.length === 1 && isPanning) {
  e.preventDefault()
  dx = touch.clientX - panStartX
  dy = touch.clientY - panStartY
  [tx, ty] = clampPan(scale, panTx0 + dx, panTy0 + dy)
  applyTransform()
} else {
  // existing swipe preventDefault logic for vertical pans
}
```

**`touchend`**:

```
if (remaining touches > 0) return  // still pinching or multi-touch in progress
if (isPanning) { isPanning = false; return }
// double-tap detection (only at scale === 1 start of touch)
// existing swipe decisive check (with scale === 1 guard)
```

**Centroid-fixed zoom math (pinch):**

The CSS transform `translate(tx, ty) scale(s)` with `transform-origin: center` means a point
`(x, y)` in frame-local coordinates maps to screen position:
```
screen_x = stageCenterX + tx + x * s
screen_y = stageCenterY + ty + y * s
```
For the pinch centroid `(cx, cy)` relative to stage center to stay fixed:
```
stageCenterX + pinchTx0 + pinchCx * pinchScale0  =  stageCenterX + tx_new + pinchCx * newScale
→  tx_new = pinchTx0 + pinchCx * (pinchScale0 - newScale)
→  ty_new = pinchTy0 + pinchCy * (pinchScale0 - newScale)
```
(pinchCx/Cy are in frame-local coordinates: `touch_x - stageCenterX - tx_at_pinch_start` divided by scale, but at start of pinch they simplify to `(touch_x - stageCenterX - pinchTx0) / pinchScale0`.)

### 5. Double-tap (`viewer.ts`)

On `touchend` (single touch, no pan, scale === 1 when tap started):
```ts
const now = Date.now();
const dx = touch.clientX - lastTapX;
const dy = touch.clientY - lastTapY;
const nearSame = Math.abs(dx) < 30 && Math.abs(dy) < 30;
if (now - lastTapT < 300 && nearSame) {
  // double-tap
  if (scale > 1) {
    resetZoom(true);
  } else {
    // zoom to 2× centered on tap
    const newScale = 2;
    const cx = touch.clientX - (stage!.getBoundingClientRect().left + stage!.clientWidth / 2);
    const cy = touch.clientY - (stage!.getBoundingClientRect().top + stage!.clientHeight / 2);
    [tx, ty] = clampPan(newScale, cx * (1 - newScale), cy * (1 - newScale));
    scale = newScale;
    applyTransform(true);
  }
  lastTapT = 0; // reset to prevent triple-tap triggering again
} else {
  lastTapT = now;
  lastTapX = touch.clientX;
  lastTapY = touch.clientY;
}
```

### 6. Scroll-wheel zoom (`viewer.ts`)

```ts
stage.addEventListener("wheel", (e) => {
  if (!isOpen()) return;
  e.preventDefault();
  const delta = e.deltaY * (e.deltaMode === 1 ? 20 : 1); // line vs pixel mode
  const factor = delta > 0 ? 0.9 : 1.1;
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
  // zoom toward cursor
  const rect = stage!.getBoundingClientRect();
  const cx = e.clientX - (rect.left + rect.width / 2);
  const cy = e.clientY - (rect.top + rect.height / 2);
  [tx, ty] = clampPan(newScale, tx + cx * (scale - newScale), ty + cy * (scale - newScale));
  scale = newScale;
  applyTransform();
}, { passive: false });
```

### 7. Keyboard zoom (`viewer.ts` — keydown handler)

Extend existing `keydown` handler (after the `Escape`/arrow checks):

```ts
else if (e.key === "+" || e.key === "=") {
  const newScale = Math.min(MAX_SCALE, scale * 1.25);
  [tx, ty] = clampPan(newScale, tx, ty);
  scale = newScale;
  applyTransform(true);
}
else if (e.key === "-") {
  const newScale = Math.max(MIN_SCALE, scale / 1.25);
  [tx, ty] = clampPan(newScale, tx, ty);
  scale = newScale;
  applyTransform(true);
}
else if (e.key === "0") {
  resetZoom(true);
}
```

Modify the `Escape` branch:
```ts
if (e.key === "Escape") {
  if (scale > 1) { resetZoom(true); }
  else { close(); }
}
```

### 8. HTML change (`src/server/views/showcase.ts`)

Add `overflow-hidden` to `#imageStage` so the zoomed frame doesn't bleed into the toolbar:

```html
<!-- before -->
<div id="imageStage" class="relative flex-1 flex items-center justify-center bg-paper min-h-0 touch-none px-3 ...">

<!-- after -->
<div id="imageStage" class="relative flex-1 flex items-center justify-center bg-paper min-h-0 touch-none overflow-hidden px-3 ...">
```

### 9. CSS change (`src/client/css/app.css`)

Add `will-change` on the frame for compositor promotion during zoom:

```css
#imageFrame {
  will-change: transform;
}
```

The transition itself is applied inline by `applyTransform()` (so the `prefers-reduced-motion`
guard works without CSS `@media` duplication).

---

## Interaction summary

| Input | Zoomed (scale > 1) | Not zoomed (scale = 1) |
|-------|--------------------|------------------------|
| 1-finger drag (vertical) | Pan image | Navigate prev/next |
| 1-finger drag (horizontal) | Pan image | Ignored |
| 2-finger pinch | Zoom | Zoom |
| Double-tap | Reset to 1× | Zoom to 2× at tap point |
| Scroll wheel / trackpad pinch | Zoom in/out | Zoom in/out |
| `+` / `=` key | Zoom in | Zoom in |
| `-` key | Zoom out | No-op (already 1×) |
| `0` key | Reset zoom | No-op |
| `Escape` | Reset zoom | Close viewer |
| Arrow keys | Navigate (zoom resets) | Navigate |
| Prev / Next buttons | Navigate (zoom resets) | Navigate |

---

## Verification

1. **Pinch zoom (mobile/devtools)**: Open viewer, two-finger pinch → image zooms centered on
   centroid; pan with one finger moves image within bounds; swipe nav does not fire.
2. **Scroll wheel (desktop)**: Hover over image, scroll up/down → zooms toward cursor; Ctrl+scroll
   (trackpad pinch) also works.
3. **Double-tap (mobile)**: First double-tap zooms to 2×; second double-tap resets; no false
   positives from single taps.
4. **Swipe guard**: Zoom in, then swipe vertically → image pans, no photo navigation. Zoom back
   to 1×, swipe → navigates normally.
5. **Reset on nav**: Zoom in, then press Next button or arrow key → photo changes and zoom resets.
6. **Keyboard**: `+`/`=`/`-`/`0` adjust zoom; `Escape` resets zoom first, then closes on second
   press.
7. **Reduced motion**: Open viewer with `prefers-reduced-motion: reduce` → zoom changes are instant
   (no CSS transition).
8. **iOS hardening intact**: Edge-zone guard (`EDGE_TOP`/`EDGE_BOTTOM`) still fires; vertical swipe
   at 1× still calls `preventDefault` to block host dismiss.
9. **Run `pnpm typecheck`** — no TypeScript errors.
10. **Run `pnpm lint`** — no oxlint warnings.
