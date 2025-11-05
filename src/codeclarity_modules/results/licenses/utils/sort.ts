import { LicenseInfo } from 'src/codeclarity_modules/results/licenses/licenses2.types';

function sort(
    licenseInfos: LicenseInfo[],
    sortBy: string | undefined,
    sortDirection: string | undefined
): LicenseInfo[] {
    // Defaults
    const ALLOWED_SORT_BY = ['dep_count', 'license_id', 'type'];
    const DEFAULT_SORT = 'type';
    const DEFAULT_SORT_DIRECTION = 'DESC';

    const mapping: { [key: string]: string } = {};

    // Validation of input
    let sortBySafe: string | undefined;
    let sortDirectionSafe: string;

    if (sortBy == null || !ALLOWED_SORT_BY.includes(sortBy)) {
        sortBySafe = DEFAULT_SORT;
    } else {
        sortBySafe = sortBy;
    }

    if (sortDirection == null || (sortDirection != 'DESC' && sortDirection != 'ASC')) {
        sortDirectionSafe = DEFAULT_SORT_DIRECTION;
    } else {
        sortDirectionSafe = sortDirection;
    }

    if (sortBySafe in mapping) sortBySafe = mapping[sortBySafe];

    // Sorting
    let sorted: LicenseInfo[] = [];

    if (sortBySafe == 'dep_count') {
        sorted = licenseInfos.sort((a: LicenseInfo, b: LicenseInfo) => {
            if ((a.deps_using_license.length ?? 0.0) > (b.deps_using_license.length ?? 0.0))
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if ((a.deps_using_license.length ?? 0.0) < (b.deps_using_license.length ?? 0.0))
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            return 0;
        });
    } else if (sortBySafe == 'license_id') {
        sorted = licenseInfos.sort((a: LicenseInfo, b: LicenseInfo) => {
            if ((a.name ?? '') > (b.name ?? '')) return sortDirectionSafe == 'DESC' ? 1 : -1;
            if ((a.name ?? '') < (b.name ?? '')) return sortDirectionSafe == 'DESC' ? -1 : 1;
            return 0;
        });
    } else if (sortBySafe == 'type') {
        sorted = licenseInfos.sort((a: LicenseInfo, b: LicenseInfo) => {
            if (a.license_compliance_violation && !b.license_compliance_violation)
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if (!a.license_compliance_violation && b.license_compliance_violation)
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            if (a.unable_to_infer && !b.unable_to_infer)
                return sortDirectionSafe == 'DESC' ? 1 : -1;
            if (!a.unable_to_infer && b.unable_to_infer)
                return sortDirectionSafe == 'DESC' ? -1 : 1;
            return 0;
        });
    }

    return sorted;
}

export { sort };
