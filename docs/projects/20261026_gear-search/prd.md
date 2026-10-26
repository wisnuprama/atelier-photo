# PRD — Search photos by gear

Status: draft · Created 2026-10-26 · Owner: Wisnu
Depends on: `20261026_my-gear-page` (supplies the entry links).

## Background

There is no search page today. Visitors can only browse album by album. On the
**My Gear** page, clicking a camera or lens should show every photo made with it,
across all albums.

## Goals

- A search page, `/search`, that lists all photos matching a gear filter.
- Entered from the Gear page by clicking an item.

## Non-goals

- Free-text / natural-language search (deliberately out of scope; hard to do
  well).
- Filters other than camera and lens (design must allow adding more later, e.g.
  year, album).
- A search box UI.

## User stories

1. As a visitor, I click a lens on the Gear page and see all photos shot with it.
2. As a visitor, I tap a photo and open it in the existing full-screen viewer
   with its EXIF panel.
3. As a visitor, I see which filter is active and can clear it.
4. As a visitor, I can combine a camera and a lens.
5. As a visitor, I can jump from a result to its album.

## Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| R1 | `GET /search?camera=…&lens=…` returns photos whose `camera_body` / `lens` exactly match; both given means AND. | Must |
| R2 | Results span all albums, newest taken first. | Must |
| R3 | Active filters are shown as removable chips. | Must |
| R4 | Photos open in the existing viewer (lightbox + EXIF). | Must |
| R5 | Each result links to or labels its album. | Should |
| R6 | No filter, or no match, shows a friendly empty state with a link to Gear. | Must |
| R7 | Query values are treated as untrusted: prepared statements, escaped output, length-capped. | Must |
| R8 | Heading includes the result count, e.g. `24 Photographs`. | Must |
| R9 | Accessible: keyboard navigable results, visible focus, alt text. | Must |
| R10 | Layout works at phone width; photos stay lazy-loaded with thumbhash placeholders. | Must |

## Acceptance criteria

- Clicking a gear card lands on `/search?lens=<encoded name>` with that lens's
  photos, including names containing `|` and spaces.
- Tapping a result opens the viewer with the right photo and EXIF.
- `/search` with an unknown value shows the empty state (HTTP 200).
- Removing a chip updates the URL and results.
