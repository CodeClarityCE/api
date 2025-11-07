import { satisfies } from 'semver';
import type {
    PaginationConfig,
    PaginationUserSuppliedConf,
    TypedPaginatedData
} from 'src/types/pagination.types';

export function isNoneSeverity(severity: number): boolean {
    return severity === 0.0 || severity === null;
}

export function isLowSeverity(severity: number): boolean {
    return severity < 4.0 && severity > 0.0;
}

export function isMediumSeverity(severity: number): boolean {
    return severity >= 4.0 && severity < 7.0;
}

export function isHighSeverity(severity: number): boolean {
    return severity >= 7.0 && severity < 9.0;
}

export function isCriticalSeverity(severity: number): boolean {
    return severity >= 9.0;
}

export function getVersionsSatisfyingConstraint(
    allVersions: string[],
    constraint: string
): string[] {
    const versionToReturn: string[] = [];

    for (const version of allVersions) {
        if (satisfies(version, constraint)) {
            versionToReturn.push(version);
        }
    }

    return versionToReturn;
}

export function getVersionsSatisfying(
    allVersions: string[],
    lower: string | null,
    upper: string | null,
    lowerIncluded: boolean,
    upperIncluded: boolean
): string[] {
    const versionToReturn: string[] = [];
    let constraint = '';

    if (lower !== null && upper !== null) {
        if (upperIncluded) constraint = `>= ${lower}`;
        else constraint = `> ${lower}`;
        if (lowerIncluded) constraint += `<= ${upper}`;
        else constraint += `< ${upper}`;
    } else if (lower === null && upper !== null) {
        if (lowerIncluded) constraint = `<= ${upper}`;
        else constraint = `< ${upper}`;
    } else if (upper === null && lower !== null) {
        if (upperIncluded) constraint = `>= ${lower}`;
        else constraint = `> ${lower}`;
    } else {
        constraint = `*`;
    }

    for (const version of allVersions) {
        if (satisfies(version, constraint)) {
            versionToReturn.push(version);
        }
    }

    return versionToReturn;
}

export class NoPreviousAnalysis extends Error {}
export class NoProjectAssociatedWithAnalysis extends Error {}

export function paginate<Type>(
    elements: Type[],
    totalEntries: number,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    paginationConfig: PaginationConfig
): TypedPaginatedData<Type> {
    // Defaults
    const MAX_ENTRIES_PER_PAGE = paginationConfig.maxEntriesPerPage;
    const DEFAULT_ENTRIES_PER_PAGE = paginationConfig.defaultEntriesPerPage;
    const DEFAULT_PAGE = 0;

    // Validation of input
    let currentPageSafe: number;
    let maxEntriesPerPageSafe: number;

    if (
        paginationUserSuppliedConf.currentPage === null ||
        paginationUserSuppliedConf.currentPage === undefined ||
        paginationUserSuppliedConf.currentPage < 0
    ) {
        currentPageSafe = DEFAULT_PAGE;
    } else {
        currentPageSafe = paginationUserSuppliedConf.currentPage;
    }

    if (
        paginationUserSuppliedConf.entriesPerPage === null ||
        paginationUserSuppliedConf.entriesPerPage === undefined ||
        paginationUserSuppliedConf.entriesPerPage < 0 ||
        paginationUserSuppliedConf.entriesPerPage > MAX_ENTRIES_PER_PAGE
    ) {
        maxEntriesPerPageSafe = DEFAULT_ENTRIES_PER_PAGE;
    } else {
        maxEntriesPerPageSafe = paginationUserSuppliedConf.entriesPerPage;
    }

    // Stats
    const matchingCount = elements.length;

    // Paginate
    elements = elements.slice(
        currentPageSafe * maxEntriesPerPageSafe,
        (currentPageSafe + 1) * maxEntriesPerPageSafe
    );

    // Stats
    const totalPages = Math.ceil(matchingCount / maxEntriesPerPageSafe);
    const entryCount = elements.length;

    return {
        data: elements,
        page: currentPageSafe,
        entries_per_page: maxEntriesPerPageSafe,
        total_entries: totalEntries,
        total_pages: totalPages,
        entry_count: entryCount,
        matching_count: matchingCount,
        filter_count: {}
    };
}
