# Browsing the gallery

This page describes the visitor experience. No account or sign‑in is needed to
browse.

## The albums page (`/`)

The home page is a grid of albums (three across on desktop, two on tablets, one on
phones). Each album shows a cover image — its most recent photograph by default —
with the album name appearing on hover or focus. Select an album to open it.

## Inside an album (`/albums/<slug>`)

An album opens as a single‑column **timeline**: photographs in order, most recently
taken first. The album title, a photograph count, and an optional description sit
at the top.

- **Year rail (desktop):** a vertical list of years floats at the right edge and
  highlights the year you're currently scrolling through. Select a year to jump to
  it.
- **Year chip (mobile):** the current year appears as a small chip while you scroll.

Images fade in as you scroll near them, replacing their blurred placeholder.

## The full‑screen viewer

Select any photograph to open the viewer.

### Keyboard

| Key            | Action                |
| -------------- | --------------------- |
| `→` or `↓`     | Next photograph       |
| `←` or `↑`     | Previous photograph   |
| `Esc`          | Close the viewer      |

Focus rings are always visible for keyboard navigation.

### Touch (phones & tablets)

- **Swipe up / down** to move between photographs. A one‑time hint shows you this
  the first time you open the viewer.
- Tap the **info** button to slide up the **photo info** sheet.

### Photo info

The info panel (a sidebar on desktop, a slide‑up sheet on mobile) shows the title,
date, any note, and the **capture data** when present: camera body, lens, focal
length, aperture, shutter speed, and ISO. Fields with no data are simply omitted.

## Accessibility

The gallery is keyboard navigable with visible focus, uses meaningful `alt` text on
images, and honors the operating system's **reduced‑motion** setting — animations
are disabled when you've asked your device to reduce motion.
