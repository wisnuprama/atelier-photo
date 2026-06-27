# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.3.0] - 2026-06-27

### Added

- Link the change message to related links ([`d3a3dbf`])
- Improve portrait viewing in PC and tablet ([`2ae5225`])
- Add changelog and release script ([`232f3ab`])
- Smart cover fallback on deletion + vitest unit tests ([`35bce06`])
- Add admin session login and safe photo deletion ([`5dfeb92`])

### Changed

- Update release script to auto fill change logs ([`e9418ad`])
- Cap photo stream width on wide screens ([`4ee669d`])

### Fixed

- Crash of extra char ([`dc46c13`])

<!-- 0.3.0 commit links -->

[`d3a3dbf`]: https://github.com/wisnuprama/atelier-photo/commit/d3a3dbf
[`2ae5225`]: https://github.com/wisnuprama/atelier-photo/commit/2ae5225
[`232f3ab`]: https://github.com/wisnuprama/atelier-photo/commit/232f3ab
[`35bce06`]: https://github.com/wisnuprama/atelier-photo/commit/35bce06
[`5dfeb92`]: https://github.com/wisnuprama/atelier-photo/commit/5dfeb92
[`e9418ad`]: https://github.com/wisnuprama/atelier-photo/commit/e9418ad
[`4ee669d`]: https://github.com/wisnuprama/atelier-photo/commit/4ee669d
[`dc46c13`]: https://github.com/wisnuprama/atelier-photo/commit/dc46c13

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
