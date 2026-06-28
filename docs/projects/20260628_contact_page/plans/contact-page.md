# Plan: Contact Page

Implements `../requirements.md` — a minimal contact page showing a greeting and a
clickable email address, configured via environment variables.

## Approach

Follow the existing SSR pattern: a template-literal view + a Fastify page route,
wired into the shared `layout`. Email and greeting come from env via `config`.

## Changes

1. **`src/server/config.ts`** — add two fields to `Config` and `config`:
   - `contactEmail: string` ← `CONTACT_EMAIL` (default `""`).
   - `contactGreeting: string` ← `CONTACT_GREETING`, trimmed; falls back to
     `"Get in Touch"` when null/empty.

2. **`.env.example`** — document `CONTACT_EMAIL` and `CONTACT_GREETING`.

3. **`src/server/views/contact.ts`** (new) — `contactPage({ email, greeting })`:
   - `<main>` centered vertically + horizontally on desktop (min-height fills
     viewport below the 4rem header), full-width with padding on mobile.
   - Greeting in larger serif text; email below as a `mailto:` link.
   - If email is empty, render the greeting alone (no broken link).
   - Escape all interpolated values with `esc`.

4. **`src/server/routes/pages.ts`** — add `GET /contact` rendering `contactPage`
   inside `layout` with `activeNav: "contact"`.

5. **`src/server/views/layout.ts`** — point the Contact nav link at `/contact`,
   give it `key: "contact"`, and widen `activeNav` / key types to include
   `"contact"` so it highlights as current.

## Accessibility / responsiveness

- Keyboard navigable: the email is a native `<a>` with visible focus (inherits
  app focus styles).
- Semantic heading for the greeting; meaningful link text (the email itself).
- Centering via flex utilities; mobile uses padding, no fixed widths.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`.
- Manual: visit `/contact` with and without `CONTACT_EMAIL` / `CONTACT_GREETING`
  set; confirm fallback greeting and mailto link.
