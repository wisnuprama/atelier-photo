# Plan — Max-width for the photo stream on wide screens

## Context

On the album/showcase page (`/albums/:slug`), photographs render in a
**single-column stream**: each `<figure>` is `w-full` inside a
`max-w-[1200px]` container (`src/server/views/showcase.ts:147-148`). On a
landscape tablet or PC monitor this means a single photo is displayed up to
1200px wide, effectively dominating the screen — a landscape frame in
particular fills nearly the whole viewport, which is uncomfortable to view.

The goal: cap the photo stream at a calmer reading width (~900px) so each
photograph sits within the screen with breathing room on either side, while
leaving the rest of the site untouched.

### Decisions (confirmed with user)

- **Scope:** photo stream only. The homepage album grid (`max-w-[1400px]`)
  and the fullscreen lightbox (intentionally immersive, `object-contain`)
  are **not** changed. The fixed year rail and the lightbox EXIF sidebar are
  left as-is on iPad landscape.
- **Target width — responsive, stepped by breakpoint** so iPad landscape
  (~1024–1366px) gets a tighter column than desktop:
  - **`lg`** (≥1024px, iPad landscape from the base iPad up): **~780px**
  - **`xl`** (≥1280px, desktop / iPad Pro 12.9" at 1366px): **~900px**
  - below `lg` (phones, tablet portrait): unchanged — full width minus the
    existing padding, since those viewports are already narrow.

  This gives clear side margins even on the smallest iPad landscape
  (1024px → ~122px each side) while keeping a comfortable 900px on desktop.

## Changes

All edits are in **`src/server/views/showcase.ts`**. The current code uses
arbitrary Tailwind max-width values (`max-w-[1200px]`, `max-w-[1400px]`)
throughout, so we stay consistent and use arbitrary, breakpoint-prefixed
values rather than introducing a new theme token.

The stepped cap is expressed as the utility pair:

```
lg:max-w-[780px] xl:max-w-[900px]
```

(no base `max-w-*`, so below `lg` the container is full-width minus padding,
matching today's behavior on narrow screens).

1. **Photo stream container** — `showcase.ts:147`
   - Replace `max-w-[1200px]` with `lg:max-w-[780px] xl:max-w-[900px]` on the
     `<div ... pb-32 relative>` that wraps `#photoStream`. Keep `mx-auto` and
     the existing `px-2 sm:px-4`.

2. **Showcase header section** — `showcase.ts:138`
   - Replace `max-w-[1200px]` with the same `lg:max-w-[780px] xl:max-w-[900px]`
     on the `<section>` holding the "Albums" back-link, title, photo count,
     and description. Keep `mx-auto` and `px-5 sm:px-8`.
   - Reason: this header currently shares the stream's max-width. Applying the
     same stepped cap keeps the title/back-link left edge aligned with the
     photos at every breakpoint, so the page stays cohesive.

No change to:
- The `#yearRail` aside (it is `fixed right-8`, independent of container width).
- Padding (`px-5 sm:px-8` on header, `px-2 sm:px-4` on stream) — these still
  apply within the narrower container.
- `src/server/views/albums.ts`, `src/server/views/layout.ts`,
  `src/client/css/app.css`, and the lightbox markup.

## Notes / considerations

- Narrowing from 1200px → 900px only ever requests a *smaller* rendered size,
  so there is no image-quality concern with the `full` derivative.
- Mobile/tablet portrait is unaffected: those viewports are already below
  900px, so the container is full-width there as before. The change only takes
  visible effect on screens wider than ~900px.
- If a shared width is wanted later (e.g. reused in another view), the two
  `max-w-[900px]` values are the natural candidates to promote into a
  `--container-*` token in `app.css` `@theme`. Not needed for this change.

## Verification

1. `pnpm build` (runs `tsc` + Tailwind compile + esbuild) to confirm the
   templates still compile and the class is picked up by the Tailwind scan
   (`@source "../../server/**/*.ts"` already covers `showcase.ts`).
2. `pnpm dev` and open an album at `/albums/:slug`, checking the stepped cap
   at each breakpoint (browser devtools responsive mode):
   - **iPad landscape, 1024px** (`lg`): photo column centered at ~780px with
     clear side margins (~122px each); title/back-link left edge aligned with
     the photos.
   - **iPad Pro 12.9" landscape, 1366px** (`xl`): column at ~900px.
   - **Desktop, ≥1280px**: column at ~900px, generous margins.
   - **Below ~1024px** (tablet portrait / phone): stream goes edge-to-edge
     (minus padding) exactly as before — no regression.
   - Open a photo: the lightbox is unchanged (still full-viewport, immersive);
     year rail and EXIF sidebar behave as today on iPad landscape.
3. Check the homepage `/`: album grid is unchanged (still `max-w-[1400px]`).
