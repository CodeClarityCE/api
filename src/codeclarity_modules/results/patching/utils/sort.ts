import type { PatchSummary } from 'src/codeclarity_modules/results/patching/patching.types';

export function sort(
    patches: PatchSummary[],
    sortBy: string | undefined,
    _sortDirection: string | undefined
): PatchSummary[] {
    // Defaults
    const ALLOWED_SORT_BY = ['patch_type'];
    const DEFAULT_SORT = 'patch_type';
    // const DEFAULT_SORT_DIRECTION = 'DESC';

    const mapping: Record<string, string> = {};

    // Validation of input
    let sortBySafe: string;
    // let _sortDirectionSafe: string;

    if (sortBy === null || sortBy === undefined || !ALLOWED_SORT_BY.includes(sortBy)) {
        sortBySafe = DEFAULT_SORT;
    } else {
        sortBySafe = sortBy;
    }

    // if (sortDirection === null || (sortDirection !== 'DESC' && sortDirection !== 'ASC')) {
    //     _sortDirectionSafe = DEFAULT_SORT_DIRECTION;
    // } else {
    //     _sortDirectionSafe = sortDirection;
    // }

    if (sortBySafe in mapping) {
        const mapped = mapping[sortBySafe];
        if (mapped !== undefined) {
            sortBySafe = mapped;
        }
    }

    // Sorting
    let sorted: PatchSummary[] = [];

    // function patchTypeToNumeric(patch_type: PatchType): number {
    //     if (patch_type === PatchType.Full) {
    //         return 1.0;
    //     } else if (patch_type === PatchType.Partial) {
    //         return 0.5;
    //     }
    //     return 0.0;
    // }

    if (sortBySafe === 'patch_type') {
        sorted = patches.sort((_a: PatchSummary, _b: PatchSummary) => {
            // if (patchTypeToNumeric(a.patch_type) > patchTypeToNumeric(b.patch_type))
            //     return sortDirectionSafe === 'DESC' ? -1 : 1;
            // if (patchTypeToNumeric(a.patch_type) < patchTypeToNumeric(b.patch_type))
            //     return sortDirectionSafe === 'DESC' ? 1 : -1;
            return 0;
        });
    }

    return sorted;
}
