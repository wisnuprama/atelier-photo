# Styling conventions (Tailwind v4)

Tokens in `src/client/css/app.css` `@theme`: `--color-paper` #fff,
`--color-ink` #0a0a0a, `--color-stone` #6b6b6b, `--color-hairline` #e6e6e6;
fonts serif (Cormorant), sans (Inter), mono (IBM Plex Mono).

Tailwind scans `../../server/**/*.ts` and `../ts/**/*.ts` via `@source` —
classes written in views **and client TS** are picked up.

## Copy-paste recipes

- **Primary button:**
  `font-mono text-[11px] label uppercase bg-ink text-paper px-5 py-2.5 hover:bg-stone transition-colors`
  (`admin-login.ts:20`)
- **Secondary/outline button:**
  `font-mono text-[11px] label uppercase border border-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors`
  (`admin-photos.ts:105, 109`)
- **Text/ghost button:**
  `font-mono text-[11px] label uppercase text-stone hover:text-ink transition-colors`
  (`admin-photos.ts:115`)
- **Destructive menu item:**
  `w-full text-left px-4 py-3 font-mono text-[11px] uppercase tracking-wide text-red-600 hover:bg-stone/5`
  (`admin.ts:8`)
- **Text input:**
  `border border-hairline bg-paper px-3 py-2 font-mono text-[13px] focus:outline-none focus:border-ink`
  (`admin-login.ts:17`); textarea variant at `admin-photos.ts:70`
- **Field label:** `font-mono text-[10px] label text-stone uppercase` inside
  `<label class="flex flex-col gap-1.5">`
- **Inline error:** `font-mono text-[9px] label text-red-600 uppercase`
  (`admin-photos.ts:64`)
- **Floating panel/menu:**
  `fixed z-[200] bg-paper border border-hairline shadow-lg rounded-lg`
  (`admin.ts:4-5`)
- **Full-screen overlay:** `hidden fixed inset-0 z-50 bg-paper` +
  `role="dialog" aria-modal="true"` (`showcase.ts:74`); scrim
  `fixed inset-0 z-30 bg-ink/30` (`showcase.ts:109`)

Utility classes `.label` (0.18em tracking) / `.label-tight` (0.12em); global
`:focus-visible` outline; `prefers-reduced-motion` block disables all
transitions.

Modal precedents (lightbox, long-press menu):
[album-detail-page.md](album-detail-page.md).
