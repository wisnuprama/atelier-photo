# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
## [0.6.1] - 2026-06-29

### Fixed

- Fix admin photo long-press menu on iOS touch screens (#13) ([`79e72bd`])

-

<!-- 0.6.1 commit links -->

[`79e72bd`]: https://github.com/wisnuprama/atelier-photo/commit/79e72bd

## [0.6.0] - 2026-06-29

### Added

- Admin page for editing photo content (#12) ([`78dbadb`])

### Changed

-
### Fixed

-

<!-- 0.6.0 commit links -->

[`78dbadb`]: https://github.com/wisnuprama/atelier-photo/commit/78dbadb

## [0.5.0] - 2026-06-28

### Added

- Improve perf and resource management during photo upload ([`8b01269`])
- Add allowList for admin session ([`1f5eae3`])
- Add rate limit ([`f6b8f99`])
- Add contact page ([`29627fd`])

### Changed

-
### Fixed

- Make footer visible if the content not long ([`95522c4`])

<!-- 0.5.0 commit links -->

[`8b01269`]: https://github.com/wisnuprama/atelier-photo/commit/8b01269
[`1f5eae3`]: https://github.com/wisnuprama/atelier-photo/commit/1f5eae3
[`f6b8f99`]: https://github.com/wisnuprama/atelier-photo/commit/f6b8f99
[`29627fd`]: https://github.com/wisnuprama/atelier-photo/commit/29627fd
[`95522c4`]: https://github.com/wisnuprama/atelier-photo/commit/95522c4

## [0.4.0] - 2026-06-28

### Added

- Log derivative generation and deletion cleanup failures ([`b965aaa`])

### Changed

- Thread request Ctx through services for dependency injection ([`e3f10e1`])

### Fixed

- Prevent path traversal via uploaded filename ([`45b2ec4`])

<!-- 0.4.0 commit links -->

[`b965aaa`]: https://github.com/wisnuprama/atelier-photo/commit/b965aaa
[`e3f10e1`]: https://github.com/wisnuprama/atelier-photo/commit/e3f10e1
[`45b2ec4`]: https://github.com/wisnuprama/atelier-photo/commit/45b2ec4

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
