import { PatchInfo } from 'src/codeclarity_modules/results/patching/patching2.types';

export function filter(
    patches: PatchInfo[],
    searchKey: string | undefined,
    activeFilters: string[] | undefined
): [PatchInfo[], { [key: string]: number }] {
    // Validation of input
    let searchkeySafe: string;
    let activeFiltersSafe: string[];
    const possibleFilters: string[] = ['full_patch', 'partial_patch', 'none_patch'];

    if (searchKey == null) {
        searchkeySafe = '';
    } else {
        searchkeySafe = searchKey;
    }

    if (activeFilters == null) {
        activeFiltersSafe = [];
    } else {
        activeFiltersSafe = activeFilters;
    }

    function filterBySearchKey(patches: PatchInfo[]): PatchInfo[] {
        if (searchKey == '') {
            return patches;
        }

        const toReturn = [];
        searchKey = searchkeySafe.toLocaleLowerCase();

        for (const patch of patches) {
            if (
                patch.affected_dep_name != null &&
                patch.affected_dep_name.toLowerCase().includes(searchKey.toLowerCase())
            ) {
                toReturn.push(patch);
                continue;
            }
            if (
                patch.vulnerability_id != null &&
                patch.vulnerability_id.toLowerCase().includes(searchKey.toLowerCase())
            ) {
                toReturn.push(patch);
                continue;
            }
        }

        return toReturn;
    }

    function filterByOptions(patches: PatchInfo[], filters: string[]): PatchInfo[] {
        const toReturn = [];

        for (const patch of patches) {
            // if (filters.includes('full_patch')) {
            //     if (patch.patch_type != PatchType.Full) continue;
            // }
            // if (filters.includes('partial_patch')) {
            //     if (patch.patch_type != PatchType.Partial) continue;
            // }
            // if (filters.includes('none_patch')) {
            //     if (patch.patch_type != PatchType.None) continue;
            // }
            toReturn.push(patch);
        }

        return toReturn;
    }

    const filteredBySearchKey = filterBySearchKey(patches);

    const counts: { [key: string]: number } = {};
    for (const filter of possibleFilters) {
        if (filter in activeFiltersSafe) continue;
        const filters = [filter];
        for (const filter of activeFiltersSafe) {
            filters.push(filter);
        }
        counts[filter] = filterByOptions(filteredBySearchKey, filters).length;
    }
    const filteredByOptions = filterByOptions(filteredBySearchKey, activeFiltersSafe);

    return [filteredByOptions, counts];
}
