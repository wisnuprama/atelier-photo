/**
 * Gear search filters (`/search?camera=…&lens=…`): query parsing and the one
 * URL builder. Pure — no DB import — so views (the gear page) and tests can use
 * it freely.
 */

/**
 * Longest filter value accepted; longer values are ignored. Must equal
 * `GEAR_NAME_MAX` in `services/gear.ts` (asserted in search-filters.test.ts;
 * not imported because gear.ts pulls in the DB module).
 */
export const SEARCH_VALUE_MAX = 200;

export interface SearchFilters {
  camera?: string;
  lens?: string;
}

/** Filter keys in canonical URL / chip order. Extend here for year/album later. */
export const SEARCH_KEYS = ["camera", "lens"] as const satisfies readonly (keyof SearchFilters)[];

/**
 * Read filters from a parsed query object. Per key: only a single string
 * counts (arrays from repeated keys are ignored), it is trimmed, and empty or
 * over-long values are dropped. Unknown keys are ignored.
 */
export function parseSearchFilters(query: unknown): SearchFilters {
  const filters: SearchFilters = {};
  if (typeof query !== "object" || query === null || Array.isArray(query)) return filters;
  const q = query as Record<string, unknown>;
  for (const key of SEARCH_KEYS) {
    if (!Object.hasOwn(q, key)) continue;
    const raw = q[key];
    if (typeof raw !== "string") continue;
    const value = raw.trim();
    if (!value || value.length > SEARCH_VALUE_MAX) continue;
    filters[key] = value;
  }
  return filters;
}

export function hasFilters(filters: SearchFilters): boolean {
  return SEARCH_KEYS.some((k) => filters[k] !== undefined && filters[k] !== "");
}

/**
 * `/search` URL for the given filters, keys in `SEARCH_KEYS` order, values
 * encoded by `URLSearchParams` (space → `+`, `|` → `%7C`). Returns `/search`
 * when no filter is set. Escape with `esc()` before putting it in HTML.
 */
export function searchHref(filters: SearchFilters): string {
  const params = new URLSearchParams();
  for (const key of SEARCH_KEYS) {
    const value = filters[key];
    if (value !== undefined && value !== "") params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}
