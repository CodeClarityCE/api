import type { LicenseInfo } from 'src/codeclarity_modules/results/licenses/licenses2.types';

function filter(
    licenseInfos: LicenseInfo[],
    searchKey: string | undefined,
    activeFilters: string[] | undefined
): [LicenseInfo[], Record<string, number>] {
    // Validation of input
    let searchkeySafe: string;
    let activeFiltersSafe: string[];
    const possibleFilters: string[] = [
        'compliance_violation',
        'unrecognized',
        'permissive',
        'copy_left'
    ];

    if (searchKey === null || searchKey === undefined) {
        searchkeySafe = '';
    } else {
        searchkeySafe = searchKey;
    }

    if (activeFilters === null || activeFilters === undefined) {
        activeFiltersSafe = [];
    } else {
        activeFiltersSafe = activeFilters;
    }

    function filterBySearchKey(licenseInfos: LicenseInfo[]): LicenseInfo[] {
        const toReturn = [];
        searchKey = searchkeySafe.toLocaleLowerCase();

        if (searchKey === '') {
            return licenseInfos;
        }

        for (const licenseInfo of licenseInfos) {
            if (licenseInfo.id !== null && licenseInfo.id !== undefined && licenseInfo.id.toLocaleLowerCase().includes(searchKey)) {
                toReturn.push(licenseInfo);
                continue;
            }
            if (
                licenseInfo.name !== null &&
                licenseInfo.name !== undefined &&
                licenseInfo.name.toLocaleLowerCase().includes(searchKey)
            ) {
                toReturn.push(licenseInfo);
                continue;
            }
        }

        return toReturn;
    }

    function filterByOptions(licenseInfos: LicenseInfo[], filters: string[]): LicenseInfo[] {
        const toReturn = [];

        for (const licenseInfo of licenseInfos) {
            if (filters.includes('compliance_violation')) {
                if (licenseInfo.license_compliance_violation === false) continue;
            }
            if (filters.includes('unrecognized')) {
                if (licenseInfo.unable_to_infer === false) continue;
            }
            if (filters.includes('permissive')) {
                if (!licenseInfo.license_category || licenseInfo.license_category !== 'permissive')
                    continue;
            }
            if (filters.includes('copy_left')) {
                if (!licenseInfo.license_category || licenseInfo.license_category !== 'copy_left')
                    continue;
            }
            toReturn.push(licenseInfo);
        }

        return toReturn;
    }

    const filteredBySearchKey = filterBySearchKey(licenseInfos);

    const counts: Record<string, number> = {};
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

export { filter };
