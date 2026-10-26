# PRD — Sort albums by recently created

Status: draft · Created 2026-10-26 · Owner: Wisnu

## Background

Albums on `/` are ordered by `position ASC, created_at ASC` (oldest first).
New albums land at the bottom. The owner wants the newest work first, while the
default **Discover** album stays at the top.

## Goals

- Album list shows the most recently created album first.
- **Discover** is always first.

## Non-goals

- Manual / custom ordering UI (planned later; see Future).
- Sorting by latest photo added or latest photo taken.
- Changing photo order inside an album.

## Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| R1 | Order: Discover (slug `discover`) first, then albums by `created_at` descending. | Must |
| R2 | Albums created in the same second have a stable, deterministic order (newer insert first). | Must |
| R3 | If no Discover album exists, ordering is simply newest first. | Must |
| R4 | Existing `position` data and column are preserved. | Must |
| R5 | All consumers of `listAlbums` keep working. | Must |

## Acceptance criteria

- With albums A (old), B (new) and Discover: list is Discover, B, A.
- Two albums inserted back-to-back: the later insert appears first.
- `GET /api/albums` still returns the expected shape (order follows the new rule).

## Future

Custom sorting. Keep ordering logic in one place (`listAlbums`) and keep the
`position` column so a later project can use it without a migration.

## Notes

- `GET /api/albums` (iOS Shortcut album picker) shares `listAlbums`, so its
  order changes too. Accepted.
