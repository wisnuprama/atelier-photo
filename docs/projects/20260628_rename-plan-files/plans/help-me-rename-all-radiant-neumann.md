# Plan: Rename Plan Files to Match Their Titles

## Context

Plan files were being generated with random auto-generated names (e.g. `memoized-humming-spark.md`, `vast-dancing-forest.md`) instead of descriptive slugs derived from the document title. This makes them hard to find by name and violates the intent of the naming convention. This plan renames all 7 offending files and locks down the naming rule in `CLAUDE.md`.

---

## Files to Rename

| Current path | New filename | Derived from title |
|---|---|---|
| `20260621_bootstrap/plans/memoized-humming-spark.md` | `dynamic-year-range-selected-work.md` | "Plan: Dynamic Year Range for 'Selected Work' Label" |
| `20260621_unit-test/plans/vast-dancing-forest.md` | `unit-tests-vitest.md` | "Plan: Unit Tests with Vitest" |
| `20260624_photo-zoom-review/plans/help-me-review-this-goofy-firefly.md` | `pr-review-pinch-scroll-double-tap-zoom.md` | "PR Review — Pinch/scroll/double-tap zoom for fullscreen viewer" |
| `20260624_photo-zoom-swipe-gesture/plans/help-me-create-a-joyful-quiche.md` | `photo-zoom-swipe-gesture-guard.md` | "Photo Zoom with Swipe Gesture Guard" |
| `20260625_cover-photo-fallback/plans/what-do-u-think-concurrent-crown.md` | `smart-cover-photo-fallback-on-deletion.md` | "Plan: Smart Cover Photo Fallback on Deletion" |
| `20260625_photo-removal/plans/what-do-u-think-concurrent-crown.md` | `safe-photo-removal-admin-ui.md` | "Plan: Safe Photo Removal via Admin UI" |
| `20260626_wide-screen-max-width/plans/help-me-plan-to-clever-grove.md` | `max-width-photo-stream-wide-screens.md` | "Plan — Max-width for the photo stream on wide screens" |

Files already well-named (no change needed):
- `20260621_bootstrap/plans/bootstrap.md`
- `20260621_bootstrap/plans/ingest-pipeline.md`
- `20260621_fullscreen-viewer-swipe-fix/plans/fullscreen-swipe-overlay-bug.md`

---

## CLAUDE.md Update

In the **"Rule — plan & design docs"** section, add a naming rule for the plan file itself:

> Plan files must use a short kebab-case slug derived from the document's title, e.g. `unit-tests-vitest.md` or `photo-zoom-swipe-gesture-guard.md`. Never use auto-generated or random filenames.

---

## Verification

After executing:
1. `ls docs/projects/*/plans/` — confirm old random filenames are gone, new descriptive names are present.
2. `git status` — confirm only renames (no content changes).
3. Read CLAUDE.md to confirm the new rule appears under "Rule — plan & design docs".
