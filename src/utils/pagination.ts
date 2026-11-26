import type {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";

/** A resolved page index (from 0) and page size. */
export interface Page {
  currentPage: number;
  entriesPerPage: number;
}

/** What a negative requested size becomes; each endpoint keeps its own answer. */
export type NegativeSize = "default" | "one" | "as-requested";

/**
 * Clamps a requested page: the page is at least 0, a size above the maximum
 * is the maximum, and a missing or zero size is the default.
 */
export function resolvePage(
  requested: PaginationUserSuppliedConf,
  config: PaginationConfig,
  negativeSize: NegativeSize = "default",
): Page {
  const currentPage = Math.max(0, requested.currentPage ?? 0);
  const size = requested.entriesPerPage;
  if (!size || (size < 0 && negativeSize === "default")) {
    return { currentPage, entriesPerPage: config.defaultEntriesPerPage };
  }
  const floored = size < 0 && negativeSize === "one" ? 1 : size;
  return {
    currentPage,
    entriesPerPage: Math.min(config.maxEntriesPerPage, floored),
  };
}

/** Builds the paginated response for one page of a list of `total` entries. */
export function paginatedData<T>(
  data: T[],
  total: number,
  page: Page,
  matchingCount: number = total,
): TypedPaginatedData<T> {
  return {
    data,
    page: page.currentPage,
    entry_count: data.length,
    entries_per_page: page.entriesPerPage,
    total_entries: total,
    total_pages: Math.ceil(total / page.entriesPerPage),
    matching_count: matchingCount,
    filter_count: {},
  };
}
