# HLS — Sort albums by recently created

## Approach

Single SQL change in `listAlbums` (`services/photos.ts`):

```sql
ORDER BY (a.slug = 'discover') DESC, a.created_at DESC, a.rowid DESC
```

- `created_at` is `datetime('now')` (1 s resolution), so `rowid DESC` is the
  deterministic tiebreaker for same-second inserts. `albums` is a rowid table
  (TEXT primary key, not `WITHOUT ROWID`), so `rowid` is available.
- Export `DEFAULT_ALBUM_SLUG` from `services/photos.ts` and use it in the query
  instead of a literal; it is currently module-private.
- `position` and `nextAlbumPosition` stay untouched (reserved for the future
  custom-sort project).

## Impact

- `/` (`pageRoutes`) and `GET /api/albums` both call `listAlbums`.
- No schema change, no migration, no client change.

## Risks

- Hidden dependence on old order (tests or iOS Shortcut). Grep for `listAlbums`
  consumers and any order assertions in `photos.test.ts` before changing.
- Discover is identified by slug; if the owner ever renames/re-slugs it the pin
  is lost. Acceptable, documented.

## Testing

DAO test with a real in-memory DB (see `testing.md` harness): Discover pinned,
newest-first, same-second tiebreak, no-Discover case.

## Docs to update

`docs/wiki/codebase/database.md` (the `listAlbums` ordering note) and
`album-list-page.md` if it mentions order.
