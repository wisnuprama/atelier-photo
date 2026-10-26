# PRD — My Gear page

Status: draft · Created 2026-10-26 · Owner: Wisnu

## Background

Every photo's EXIF already stores the camera body and lens (`photos.camera_body`,
`photos.lens`). Visitors can see them one photo at a time in the viewer. There
is no place that shows the owner's gear as a whole, or which pieces are still in
use.

## Goals

- A public page, **My Gear**, listing every camera and lens found in the
  photos, derived automatically from EXIF.
- The admin marks each item active or inactive; the page splits into two
  sections accordingly.
- The page feels personal, in the same quiet gallery voice as the rest of the
  site.
- A new **Gear** link in the navbar.

## Non-goals

- Notes, stories, or display-name editing per item (checkbox only for v1).
- Merging aliases of the same physical item.
- Gear that has no photos (list is derived from photos only).
- A shopping/affiliate layer, specs, or prices.

## User stories

1. As a visitor, I open **Gear** and see what the photographer shoots with now
   and what they used before.
2. As a visitor, I see how many photos and which years each item covers, plus a
   sample photo made with it.
3. As the admin, I tick a checkbox on an item to mark it active or inactive; the
   item moves to the right section.
4. As the admin, a newly uploaded photo with a new lens shows up automatically as
   active.
5. As a visitor, I can click an item to see its photos (see
   `20261026_gear-search`).

## Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| R1 | `GET /gear` renders two sections: Active and Inactive. Each is split by Cameras and Lenses. | Must |
| R2 | Items come from distinct non-null `camera_body` / `lens` values. | Must |
| R3 | Items default to active when never toggled. | Must |
| R4 | Admin sees a checkbox per item; toggling persists and moves the item. Visitors do not see it. | Must |
| R5 | Toggle endpoint requires an admin session (401 otherwise). | Must |
| R6 | Each item shows photo count, year range, and a sample photo (most recent). | Must |
| R7 | Navbar has **Gear** (desktop and mobile), marked current on the page. | Must |
| R8 | Page title/heading is "My Gear"; copy is personal, not spec-sheet-like. | Must |
| R9 | Empty states handled (no gear yet; no inactive items hides that section). | Must |
| R10 | Accessible: keyboard-operable checkbox, visible focus, meaningful alt text, honours reduced motion. | Must |
| R11 | Each item links to the search page filtered by that item. | Must (depends on `gear-search`) |

## Content direction ("personal")

Defaults to refine in design:
- Sections: "In the bag" (active) and "Resting" / "Past companions" (inactive).
- A short intro line in the serif voice above the sections.
- Item cards use the sample photo, the item name in serif italic, and mono
  metadata such as `42 photographs · 2024—2026`.

Final wording is the owner's call and is easy to change in the view.

## Acceptance criteria

- Uploading a photo with a never-seen lens makes it appear under Active without
  any admin action.
- Unchecking an item moves it to Inactive after reload (and without a reload if
  the plan chooses progressive enhancement).
- Visitor view contains no admin controls.
- Gear nav item is current on `/gear`.
