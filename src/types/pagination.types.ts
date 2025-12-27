/**
 * Interface for a paginated data object with type parameter.
 */
export interface TypedPaginatedData<Type> {
  /**
   * The array of typed data.
   */
  data: Type[];

  /**
   * The current page number.
   */
  page: number;

  /**
   * The total count of entries across all pages.
   */
  entry_count: number;

  /**
   * The number of entries per page.
   */
  entries_per_page: number;

  /**
   * The total number of entries in the data set.
   */
  total_entries: number;

  /**
   * The total number of pages across all entries.
   */
  total_pages: number;

  /**
   * The count of matching results after applying filters.
   */
  matching_count: number;

  /**
   * A map of filter counts keyed by filter name.
   */
  filter_count: Record<string, number>;
}

/**
 * Interface for pagination configuration options.
 */
export interface PaginationConfig {
  /**
   * The maximum allowed entries per page.
   */
  maxEntriesPerPage: number;

  /**
   * The default number of entries to display per page.
   */
  defaultEntriesPerPage: number;
}

/**
 * Interface for user-supplied pagination configuration options.
 */
export interface PaginationUserSuppliedConf {
  /**
   * The current page number (optional).
   */
  currentPage?: number | undefined;

  /**
   * The number of entries per page (optional).
   */
  entriesPerPage?: number | undefined;
}
