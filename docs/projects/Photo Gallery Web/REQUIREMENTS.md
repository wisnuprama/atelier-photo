# Photo Gallery Web — Requirements

## Background

A website to showcase the photos I take. It's meant to read as professional, but
still feel personal. The aesthetic is minimalist black-and-white — imagine a
contemporary building built to exhibit photographs.

Reference: https://www.geoffreygoddardphotography.com/

---

## Requirements

### Functional

#### 1. Album page

- Display albums in a grid of 3, responsive down to 2 columns on tablet and 1 on
  phone.
- Each album shows a single featured photo in a 3:4 portrait ratio.
- The album name is hidden by default and appears only on hover (and on keyboard
  focus), centered over a darkened overlay of the photo.
- Clicking an album opens its Timeline / Showcase page.

#### 2. Timeline / Showcase page

Reference layout: https://www.geoffreygoddardphotography.com/

- Shows all photos from the selected album.
- One photo per row.
- Sorted by most recently taken.
- **Photos only — no title, date, or commentary is shown inline on the timeline.**
  All per-photo metadata lives in the fullscreen viewer.
- Spacing between photos is tight (minimal vertical and horizontal gap) so the
  stream reads like a continuous gallery wall. The album header text (album name,
  photo count, description) keeps a comfortable horizontal inset, slightly set in
  from the photo edges like a wall label.
- Clicking a photo opens the fullscreen viewer.
- A yearly timeline navigation sits on the right side of the page. It highlights
  the current year as the user scrolls and jumps to that year's first photo on
  click. On phones it collapses to a small floating year chip.

#### 3. Fullscreen viewer

Opens when a photo is clicked. The image is the hero; chrome stays minimal.

**Layout**

- **Desktop:** photo centered with EXIF shown as a persistent right sidebar.
- **Mobile:** photo fills the screen. EXIF is hidden by default and opens as a
  slide-up sheet, triggered by an info (ⓘ) icon, over a dimmed scrim. It can be
  dismissed by tapping the scrim or the down-chevron, and it resets to closed when
  navigating to another photo or closing the viewer.

**Per-photo content**

- Title (optional)
- My personal commentary (optional)
- Capture date
- EXIF: original filename, camera body, lens, focal length, aperture, shutter,
  ISO.

**Navigation**

- Primary gesture is **vertical**: swipe **up → next**, swipe **down → previous**.
- On-screen up / down controls and keyboard support (↑ / ↓, also ← / →, Esc to
  close).
- A one-time gesture hint ("Swipe to browse") appears when the viewer opens and
  fades out (and dismisses on the first swipe). Touch only.
- A photo counter is shown (e.g. `01 / 14`).
- Closing the viewer syncs the timeline's scroll position back to the photo that
  was being viewed.

**Controls placement**

- All viewer controls (close, previous, counter, next, info) live in a single
  **bottom toolbar**, deliberately kept out of the top zone. This avoids a host
  app's modal header (e.g. an in-app/modal webview presented as a sheet) drawing
  its own chrome over the top of the page and occluding our controls. The toolbar
  respects safe-area insets (notch, home indicator).

**iOS / modal-webview gesture hardening**

The vertical swipe can conflict with a host app's native swipe-to-dismiss gesture
and with Safari's overscroll. There is no reliable JavaScript API to detect a
modal / dismissable webview, so this is handled by neutralizing the gesture rather
than detecting the container:

- Vertical pans over the image stage are captured (`preventDefault`, non-passive
  listener) so the host's swipe-to-dismiss and Safari rubber-band / pull-to-refresh
  cannot hijack navigation.
- `touch-action: none` on the image stage; `overscroll-behavior: none` on the
  viewer.
- Swipes that start in the top grabber zone (~44px) or the bottom home-indicator
  zone (~24px) are ignored, so an intentional native dismiss still works.
- A velocity / intent gate: only a decisive, clearly-vertical flick (or a long
  deliberate drag) navigates; a slow drag — the signature of a dismiss attempt —
  does not.
- Guaranteed fallback: the on-screen up / down controls always work, even if a
  hostile host recognizer wins the gesture.

#### 4. Admin / ingestion

- Provide a private API that can be triggered from an iOS Shortcut, so I can share
  a photo straight from Lightroom.
- Support bulk upload.
- Each photo entry supports:
  - My personal commentary (optional)
  - Title (optional)
  - EXIF
- Upload using the original filename. Uploading a file with the same filename
  replaces the existing file.
- Preserve the EXIF data.
- On ingest, compute and store the photo's **ThumbHash** and intrinsic dimensions
  (width and height) alongside the entry, so the client can render the blur-up
  placeholder and reserve the correct aspect-ratio box. Recompute on replace.

#### 5. Navigation bar

- Simple navigation for both mobile and desktop: minimal wordmark plus links,
  a hamburger menu on mobile, and a hairline divider that appears under the bar on
  scroll.

---

### Non-functional

#### 1. Timeline / showcase

- Able to display hundreds of photos.
- Lazy-load photos as the user scrolls. While a photo loads, show a **ThumbHash**
  blur-up placeholder decoded from the photo's stored hash (rather than a generic
  shimmer). Because ThumbHash encodes the aspect ratio, the placeholder reserves
  the correct layout box and prevents layout shift (CLS) as images arrive.

#### 2. Lightweight

- Prefer web standards and plain CSS as much as possible. Keep it lightweight.

#### 3. Tech

- **Tailwind** for CSS — compiled/production build. (The clickable MVP used the
  Tailwind Play CDN for speed; that is explicitly not for production.)
- **Lucide** for iconography.
- **ThumbHash** for image placeholders — encode at ingest (server), decode to a
  blur-up preview on the client.
- **Fastify + Node.js** for the backend.
- **SQLite** for the database.
- **TypeScript 6** and **ESM**.
- **oxfmt** and **oxlint** for formatting and linting.
- **Podman** Containerfile, volume, and quadlet.

#### 4. Accessibility

- Backward-compatible with web standards; accessible to everyone.
- Keyboard navigable with visible focus states.
- Honor `prefers-reduced-motion` (disable shimmer / transition animation).
- Meaningful `alt` text on images.

#### 5. Responsive

- Support phone, tablet, and desktop.

---

### Design UI/UX

- Minimalist white and black — a contemporary building/gallery built to showcase
  photographs and art.
- The photos are the hero; the interface stays out of the way.
- Type direction (from the MVP): an elegant serif for the wordmark and album /
  photo titles (the "personal" feel), small tracked-out uppercase labels like
  gallery wall plates, and a monospace face for data (EXIF, years, counter).
- Reference: https://www.geoffreygoddardphotography.com/

---

## Revisions in this version

Decisions captured from the UI/UX prototyping discussion:

1. **Timeline is photos-only.** Title, date, and commentary were removed from the
   timeline rows and now appear exclusively in the fullscreen viewer.
2. **Tighter timeline spacing**, with the album header text keeping its original
   horizontal inset.
3. **Fullscreen viewer reworked for mobile:** image fills the screen; EXIF is
   hidden behind an info icon and opens as a slide-up sheet (persistent sidebar on
   desktop).
4. **Navigation gesture changed from horizontal to vertical** (up = next,
   down = previous), with an on-screen gesture hint.
5. **iOS / modal-webview hardening** added for the vertical gesture (gesture
   capture, edge exclusion, velocity gate), after observing conflicts with a host
   app's modal sheet. Concluded that modal-webview detection is not reliably
   possible and the gesture must be neutralized instead.
6. **Controls consolidated into a safe-area-aware bottom toolbar**, after the host
   app's modal header was found to occlude top-positioned controls (the info icon
   and close button).
7. **Placeholders standardized on ThumbHash** — compact blur-up previews computed
   at ingest and stored per photo (with intrinsic dimensions), replacing the
   generic shimmer and preventing layout shift.

### Open notes

- Placeholders are standardized on **ThumbHash**, computed at ingest and stored
  per photo. Separately, full-size delivery still needs a real thumbnail /
  resized-derivative pipeline for the timeline and viewer. The MVP's remote
  placeholder service is a stand-in only.
- Alternative considered: map swipe-down to "dismiss the viewer" (instead of
  "previous") to fully align with iOS muscle memory, leaving "previous" on the
  on-screen control only. Not adopted, but on the table.
