export interface TypedPaginatedData<Type> {
    data: Array<Type>;
    page: number;
    entry_count: number;
    entries_per_page: number;
    total_entries: number;
    total_pages: number;
    matching_count: number;
    filter_count: { [key: string]: number };
}

export interface PaginationConfig {
    maxEntriesPerPage: number;
    defaultEntriesPerPage: number;
}

export interface PaginationUserSuppliedConf {
    currentPage?: number;
    entriesPerPage?: number;
}
