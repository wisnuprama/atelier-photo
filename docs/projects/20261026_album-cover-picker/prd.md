# PRD — Album cover picker

Status: draft · Created 2026-10-26 · Owner: Wisnu

## Background

Each album shows a cover on the album list (`/`). Today the cover is chosen
automatically (most recently taken photo). The column `albums.cover_photo_id`
and the read path already support a pinned cover, but nothing in the product
sets it. The owner cannot choose which photo represents an album.

## Goals

- The admin can pick any photo in an album as that album's cover.
- Picking is fast and available where the admin already works: on the album
  page (long-press) and in the admin photos portal.

## Non-goals

- Cropping or repositioning the cover (cards crop to 3:4 centre; unchanged).
- Choosing a cover from a different album.
- Custom cover upload separate from album photos.

## User stories

1. As the admin, I long-press (or right-click) a photo on an album page and
   choose "Set as album cover".
2. As the admin, I open `/admin/photos` and set a row's photo as its album's
   cover.
3. As the admin, I can see which photo is the current cover.
4. As the admin, I can return an album to the automatic cover.
5. As a visitor, I see the new cover on `/` after it is set.

## Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| R1 | Long-press menu on album page has "Set as album cover" next to "Delete photo". | Must |
| R2 | `/admin/photos` shows the cover state per row and offers "Set as cover". | Must |
| R3 | Only an authenticated admin session can change a cover (401 otherwise). | Must |
| R4 | A photo can only be the cover of the album it belongs to. | Must |
| R5 | The current cover is visibly marked in the admin portal. | Must |
| R6 | "Reset to automatic" clears the pinned cover. | Should |
| R7 | Menu stays on screen on small viewports with the extra item. | Must |
| R8 | Deleting the cover keeps the existing promotion behaviour. | Must |

## Acceptance criteria

- Setting a cover from either entry point changes the card image on `/` after
  reload.
- Calling the endpoint without a session returns 401; with an unknown photo
  returns 404.
- Existing delete-from-long-press still works; no layout regression of the menu.
- Keyboard users can reach "Set as cover" in the admin portal (button, visible
  focus).

## Decisions

- Mark/feedback for success on the album page: lightweight, non-blocking (no
  `alert()` on success; keep `alert()` on failure to match Delete).
