# Plan: Photo Zoom with Swipe Gesture Guard

## Context

The fullscreen viewer currently supports vertical swipe gestures (up = next, down = previous) for navigation. There is no zoom capability. Users who want to inspect photo detail have no way to do so, and if zoom were added without guarding the swipe gesture, a pan drag while zoomed would accidentally trigger navigation. This plan adds pinch-to-zoom, scroll-wheel zoom, and double-tap zoom to the viewer, and disables swipe navigation whenever the image is zoomed in.

---

## Zoom State

Three variables added to `initViewer()` scope in `src/client/ts/viewer.ts`:

```ts
let scale = 1;   // 1 = fit, max = 5
let tx = 0;      // pan offset in screen px (applied after scale)
let ty = 0;
```

Transform applied to `#imageFrame`:
```
transform: translate(${tx}px, ${ty}px) scale(${scale})
```
`transform-origin` remains `center` (default). Using `translate(…) scale(…)` order keeps tx/ty in screen-pixel space, making clamp math straightforward.

---

## Helper Functions (all inside `initViewer`)

### `applyTransform(animated?: boolean)`
Sets `imageFrame.style.transform`. If `animated && !reduceMotion`, adds a short `transition: transform 0.15s ease-out`; otherwise clears it. Called after every gesture update.

### `resetZoom(animated?: boolean)`
Sets `scale = 1; tx = 0; ty = 0;` then calls `applyTransform(animated)`.

### `clampPan()`
After any change to `tx`/`ty`, clamp so the user cannot pan past the image edges:
```ts
const maxTx = Math.max(0, (scale - 1) * frame.offsetWidth  / 2);
const maxTy = Math.max(0, (scale - 1) * frame.offsetHeight / 2);
tx = Math.max(-maxTx, Math.min(maxTx, tx));
ty = Math.max(-maxTy, Math.min(maxTy, ty));
```

### `zoomAround(newScale, cx, cy)`
Zoom to `newScale` keeping the point `(cx, cy)` — relative to the frame center — visually fixed:
```ts
const clamped = Math.max(1, Math.min(5, newScale));
// To keep cx/cy fixed: adjust translation proportionally to scale change
tx += cx * (1 - clamped / scale);   // cx/cy are in screen px from frame center
ty += cy * (1 - clamped / scale);
scale = clamped;
clampPan();
applyTransform();
```

---

## Navigation Guard

Modify `next()` and `prev()` to reset zoom before changing photo:
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

---

## Touch Handling Restructure (`src/client/ts/viewer.ts`)

The existing single-finger swipe handlers need to be extended to also handle:
1. Two-finger pinch (zoom)
2. Single-finger pan when zoomed
3. Double-tap toggle zoom

Replace the three `touchstart`/`touchmove`/`touchend` handlers on `#imageStage` with a unified set:

### touchstart
- If `e.touches.length === 2`: enter **pinch mode** — record both touch positions, compute initial pinch distance and centroid; set `pinching = true`.
- If `e.touches.length === 1`: check for **double-tap** (second tap within 300 ms and 30 px of first), then record start position and time for swipe/pan mode. Keep `sY`, `sX`, `sT`, `sActive` logic unchanged.

### touchmove
- If `pinching`: compute new distance/centroid, call `zoomAround(…)`, call `e.preventDefault()`.
- Else if `scale > 1` (panning): translate by delta from last position, `clampPan()`, `applyTransform()`, call `e.preventDefault()` to prevent Safari dismiss.
- Else (swipe mode): existing vertical intent check + `e.preventDefault()` if predominantly vertical.

### touchend
- If `pinching && e.touches.length < 2`: exit pinch mode (`pinching = false`).
- Else if `scale > 1`: end pan (no navigation).
- Else: existing `decisive` check for swipe navigation — **unchanged**, no extra condition needed because `scale === 1` is already implied by reaching this branch.

New state variables:
```ts
let pinching = false;
let pinchDist0 = 0;
let pinchScale0 = 1;   // scale at pinch start
let pinchCx = 0;       // centroid relative to frame center
let pinchCy = 0;
let panLastX = 0;
let panLastY = 0;
let lastTapT = 0;
let lastTapX = 0;
let lastTapY = 0;
```

---

## Desktop Scroll-Wheel Zoom

```ts
stage.addEventListener("wheel", (e) => {
  if (!isOpen()) return;
  e.preventDefault();
  const rect = frame.getBoundingClientRect();
  const cx = e.clientX - (rect.left + rect.width  / 2);
  const cy = e.clientY - (rect.top  + rect.height / 2);
  // macOS trackpad pinch sends wheel+ctrlKey with large deltaY
  const delta = e.ctrlKey ? -e.deltaY * 0.02 : -e.deltaY * 0.005;
  zoomAround(scale * (1 + delta), cx, cy);
  applyTransform();
}, { passive: false });
```

---

## Keyboard Zoom

In the existing `keydown` listener, add:
```ts
else if (e.key === "+" || e.key === "=") zoomAround(scale * 1.3, 0, 0);
else if (e.key === "-")                  zoomAround(scale / 1.3, 0, 0);
else if (e.key === "0")                  resetZoom(true);
else if (e.key === "Escape") {
  if (scale > 1) { resetZoom(true); return; }
  close();
}
```
Move the existing `Escape → close()` into this block so Escape first resets zoom, then closes on a second press.

---

## Double-Tap Logic

Inside `touchstart` for single-finger touches:
```ts
const now = Date.now();
const t0 = e.touches[0]!;
const dist = Math.hypot(t0.clientX - lastTapX, t0.clientY - lastTapY);
if (now - lastTapT < 300 && dist < 30) {
  // Double tap
  if (scale > 1) {
    resetZoom(true);
  } else {
    const rect = frame.getBoundingClientRect();
    const cx = t0.clientX - (rect.left + rect.width  / 2);
    const cy = t0.clientY - (rect.top  + rect.height / 2);
    zoomAround(2.5, cx, cy);
    applyTransform(true);
  }
  lastTapT = 0; // prevent triple-tap triggering again
  return;
}
lastTapT = now;
lastTapX = t0.clientX;
lastTapY = t0.clientY;
```

---

## Markup Changes (`src/server/views/showcase.ts`)

Add `overflow-hidden` to `#imageStage` so the zoomed frame is clipped to the stage area:
```html
<div id="imageStage" class="... overflow-hidden touch-none ...">
```

Add a CSS class `will-change-transform` to `#imageFrame` or set inline `will-change: transform` to promote it to its own compositor layer for smooth zooming.

---

## CSS Changes (`src/client/css/app.css`)

Add `will-change: transform` for the frame during zoom (optional — can be applied inline via JS when zoom begins, removed when reset):

```css
#imageFrame.zooming {
  will-change: transform;
}
```

No animation keyframes needed — transitions are applied inline via `applyTransform(animated)`.

---

## Accessibility

- Keyboard zoom: `+`/`=`, `-`, `0` (reset), `Escape` (reset then close)
- `prefers-reduced-motion`: `resetZoom()` and `zoomAround()` skip animated transitions
- `aria-label` on `#imageFrame` is unchanged; zoom state is not announced (low priority — mainly a visual inspection feature)

---

## Files Modified

| File | Change |
|------|--------|
| `src/client/ts/viewer.ts` | Add zoom state, `applyTransform`, `resetZoom`, `clampPan`, `zoomAround`; restructure touch handlers; add wheel handler; extend keyboard handler |
| `src/server/views/showcase.ts` | Add `overflow-hidden` to `#imageStage` |
| `src/client/css/app.css` | Optionally add `#imageFrame.zooming { will-change: transform }` |

---

## Verification

1. **Mobile pinch**: Open viewer → pinch out → image zooms in centered on pinch midpoint → drag to pan → swipe up/down does NOT navigate → navigate with on-screen chevrons resets zoom.
2. **Double-tap**: Tap twice quickly → zooms to 2.5× at tap point → double-tap again → resets.
3. **Scroll wheel (desktop)**: Scroll or trackpad pinch → zooms centered on cursor.
4. **Keyboard**: `+` zooms in, `-` zooms out, `0` resets, `Escape` resets then closes.
5. **Photo change**: Tap prev/next button while zoomed → zoom resets before crossfade.
6. **`prefers-reduced-motion`**: Zoom transforms apply instantly without transitions.
7. **iOS edge zones**: Swipes starting in top 44 px or bottom 24 px are still ignored (existing guard unchanged).
8. **EXIF sheet**: When EXIF panel is open on mobile, swipe nav is still blocked (existing guard unchanged).
