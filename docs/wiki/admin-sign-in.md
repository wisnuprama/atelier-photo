# Admin sign-in

Uploading photos is done with signed API requests (see
[Adding photos](./adding-photos.md)). Some owner actions — like
[deleting a photo](./deleting-photos.md) — are done from the browser instead, and
those need an **admin session**. You sign in once, and the session turns on the
extra controls on the gallery pages.

This browser session is separate from the HMAC header auth used for ingest. Your
upload scripts and iOS Shortcut keep working unchanged; nothing here touches them.

## Signing in

1. Go to **`/admin/login`**.
2. Enter your **Secret** — the same value as `ADMIN_HMAC_SECRET` (see
   [Running & maintenance](./running-and-maintenance.md)). There is no Key ID
   field; the secret is the only credential.
3. Submit. A wrong secret re-renders the form with an **Invalid secret** message;
   the correct secret signs you in and redirects you home (or back to wherever you
   were headed via the `?next=` parameter, which is restricted to in-site paths).

If you open `/admin/login` while already signed in, you're redirected to `/`.

## The session cookie

A successful login sets a cookie named **`admin_session`**:

| Property      | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Contents      | `<issuedAt>.<hmac>` — stateless, signed with `ADMIN_HMAC_SECRET`. |
| Lifetime      | **2 days**, then it expires and you must sign in again.        |
| Flags         | `HttpOnly`, `SameSite=Strict`, `Path=/`.                       |
| `Secure` flag | Set only when `NODE_ENV=production` (HTTPS).                   |

The cookie carries no server-side state — it's verified on each request by
recomputing the HMAC and checking it hasn't expired. There's nothing to clean up
server-side.

## Signing out

Sign out by sending **`POST /admin/logout`** (the admin header strip on album
pages exposes a **Logout** link for this). It clears the cookie and redirects to
`/`. The admin-only controls disappear immediately on the next page load.

## What a session unlocks

- [Editing photos](./editing-photos.md) — the admin photo table at
  `/admin/photos`, for editing title/commentary inline and bulk CSV edits.
- [Deleting photos](./deleting-photos.md) from an album page.

There's no UI yet for deleting **albums** or moving a photo between albums. (You
can still change a photo's title/commentary by re-uploading it with the same
filename to the same album — see
[Replacing a photo](./adding-photos.md#replacing-a-photo) — but the
[photo table](./editing-photos.md) is the easier way.)
