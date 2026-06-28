# PR Review — Pinch/scroll/double-tap zoom for fullscreen viewer

PR: [#4 `claude/photo-zoom-swipe-gesture-o164kd`](https://github.com/wisnuprama/atelier-photo/pull/4)

## Context

The PR adds zoom + pan to the fullscreen lightbox: scroll-wheel / trackpad-pinch
on desktop, two-finger pinch + drag-to-pan + double-tap on touch, and `+`/`-`/`0`
keyboard controls. It layers on top of the existing iOS-hardened vertical-swipe
navigation in `src/client/ts/viewer.ts`, arbitrating between swipe-nav (scale = 1)
and pan (scale > 1).

Files: `src/client/ts/viewer.ts` (+186), `src/client/css/app.css` (will-change),
`src/server/views/showcase.ts` (`overflow-hidden` on `#imageStage`).

## Verdict

Solid, well-structured change. Gesture arbitration (swipe vs pan vs pinch) is
thoughtful and the zoom-to-point math is correct. No blocking bugs found. The
notes below are polish/edge-case items, not correctness blockers.

## Strengths

- **Zoom-to-point math is correct.** `tx += cx * (1 - clamped/scale)` is the right
  anchor formula given the `translate() scale()` order and center transform-origin;
  `cx/cy` are consistently measured from the post-transform `getBoundingClientRect()`
  center in wheel, double-tap, and pinch paths.
- **Clean gesture state machine.** Pinch / pan / swipe are mutually exclusive and
  reset correctly; `resetZoom()` is called on `next()`/`prev()`/`openViewer()` so
  zoom never leaks across photos or sessions.
- **iOS hardening preserved.** `touch-action: none` + `passive:false` +
  `preventDefault` on vertical/pan moves keeps the host webview from hijacking;
  continues the swipe-fix approach.
- **Keyboard accessible.** `+`/`-`/`0` and the two-stage Escape (reset → close).

## Findings (non-blocking)

1. **Pan bounds use the frame, not the image (polish).**
   `clampPan()` derives `maxTx/maxTy` from `frame.offsetWidth/Height`. The images
   are `object-contain`, so for a photo whose aspect ratio differs from the stage
   the rendered image is letterboxed and you can pan empty paper into view before
   hitting the clamp. Tighter bounds would compute the displayed image box
   (frame size × contain-fit ratio). Minor; acceptable for v1.

2. **`will-change: transform` is permanent (perf).**
   The CSS comment says "during zoom/pan," but `#imageFrame` carries it always,
   pinning a compositor layer for every photo even when never zoomed. MDN warns
   against leaving `will-change` on permanently. Consider toggling it from JS on
   first interaction (or accept the small, constant memory cost and fix the
   comment to match).

3. **Pinch ignores centroid movement (UX).**
   Pinch anchors to the centroid captured at `touchstart` and never updates it, so
   a two-finger *drag* during a pinch doesn't pan. Re-deriving the centroid each
   `touchmove` and adding its delta to `tx/ty` would make two-finger pinch-and-drag
   feel natural. Optional.

4. **`pinchDist0` divide-by-zero (edge).**
   If two touches register at the same point, `pinchDist0 === 0` → `dist/pinchDist0`
   is `Infinity`/`NaN` → transform breaks. Guard with `if (pinchDist0 < 1) return;`
   or a small epsilon. Very unlikely in practice.

5. **Over-pan into empty space at exactly scale 1.** Tied to #1 — at `scale === 1`,
   `maxTx/maxTy` are 0 so pan is disabled (good); the issue only appears once
   zoomed. No action needed beyond #1.

## Nits / questions

- `close()` doesn't reset zoom; it relies on `openViewer()` resetting on next open.
  Works today, but resetting in `close()` too would be more defensive.
- Two-stage Escape (zoom reset, then close) is reasonable but undocumented — fine
  for a personal app.
- No automated tests in the repo, so this is manual-verification only.

## Verification (manual)

```
pnpm typecheck   # confirm viewer.ts compiles on the branch
pnpm lint
pnpm dev         # open a photo in the lightbox and exercise:
```
- Trackpad pinch / scroll-wheel zoom toward cursor; image clips at stage edge.
- Touch: two-finger pinch, drag-to-pan when zoomed, double-tap to 2.5× and back.
- Confirm swipe-nav still works at scale 1 and is suppressed while zoomed.
- `+`/`-`/`0` and Escape (reset-then-close) on keyboard.
- Re-check the prior ghost-bleed fix still holds when navigating while/after zoom.

## Optional follow-ups I can implement

- Guard `pinchDist0` (#4) — one line, safe.
- Tighten `clampPan()` to the contained image box (#1).
- Toggle `will-change` from JS or correct the comment (#2).
