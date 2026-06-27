# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-06-24

### Added

- Photo and album ingestion pipeline (originals → derivatives with EXIF and
  thumbhash).
- Pinch, scroll, and double-tap zoom in the fullscreen viewer, with a guard so
  zooming no longer triggers swipe navigation.
- Custom error page handler.
- `build-container` image script and Podman quadlet self-hosting guide.
- README and deployment documentation.
- iOS Scriptable upload guide for `/admin/photos`, with stable filenames so the
  replace rule works reliably.

### Changed

- Rebranded the gallery to **Still**, including an updated navbar.
- Year display now derives from the uploaded image's date rather than the
  current date.

### Fixed

- Ghost photo bleed-through when the aspect ratio changed in the lightbox.
- Upload script reliability improvements.
- Container image build.

## [0.1.0] - 2026-06-21

### Added

- Initial project bootstrap: requirements, design prototype, and tech setup
  (Fastify SSR, TypeScript ESM, better-sqlite3, Tailwind v4, esbuild client
  bundling).
