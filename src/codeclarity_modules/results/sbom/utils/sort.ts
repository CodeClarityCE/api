import { gt, lt } from 'semver';
import type { SbomDependency } from 'src/codeclarity_modules/results/sbom/sbom.types';


function sort(
    dependencies: SbomDependency[],
    sortBy: string | undefined,
    sortDirection: string | undefined
): SbomDependency[] {
    // Defaults
    const ALLOWED_SORT_BY = [
        'combined_severity',
        'name',
        'version',
        'package_manager',
        'unlicensed',
        'deprecated',
        'outdated',
        'licenses',
        'newest_release',
        'last_published',
        'user_installed',
        'release',
        'dev',
        'is_direct_count'
    ];
    const DEFAULT_SORT = 'dev';
    const DEFAULT_SORT_DIRECTION = 'desc';

    const mapping: Record<string, string> = {
        user_installed: 'is_direct'
    };

    // Validation of input
    let sortBySafe: string;
    let sortDirectionSafe: string;

    if (sortBy === null || sortBy === undefined || !ALLOWED_SORT_BY.includes(sortBy)) {
        sortBySafe = DEFAULT_SORT;
    } else {
        sortBySafe = sortBy;
    }

    if (sortDirection === null || sortDirection === undefined || (sortDirection !== 'DESC' && sortDirection !== 'ASC')) {
        sortDirectionSafe = DEFAULT_SORT_DIRECTION;
    } else {
        sortDirectionSafe = sortDirection;
    }

    if (sortBySafe in mapping) {
        const mapped = mapping[sortBySafe];
        if (mapped !== undefined) {
            sortBySafe = mapped;
        }
    }

    // Sorting
    let sorted: SbomDependency[] = [];

    if (sortBySafe === 'licenses') {
        sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
            console.log(a, b);

            // if ((a.licenses[0] ?? '') > (b.licenses[0] ?? ''))
            //     return sortDirectionSafe === 'DESC' ? 1 : -1;
            // if ((a.licenses[0] ?? '') < (b.licenses[0] ?? ''))
            //     return sortDirectionSafe === 'DESC' ? -1 : 1;
            return 0;
        });
    } else if (
        sortBySafe === 'unlicensed' ||
        sortBySafe === 'deprecated' ||
        sortBySafe === 'outdated' ||
        sortBySafe === 'is_direct'
    ) {
        sorted = dependencies.sort((a: any, b: any) => {
            if ((a[sortBySafe] ?? false) > (b[sortBySafe] ?? false))
                return sortDirectionSafe === 'DESC' ? -1 : 1;
            if ((a[sortBySafe] ?? false) < (b[sortBySafe] ?? false))
                return sortDirectionSafe === 'DESC' ? 1 : -1;
            return 0;
        });
    } else if (sortBySafe === 'combined_severity') {
        sorted = dependencies.sort(() => {
            return 0;
        });
        // sorted = dependencies.sort((a: SbomDependency, b: SbomDependency) => {
        //     // if ((a.combined_severity ?? 0.0) > (b.combined_severity ?? 0.0))
        //     //     return sortDirectionSafe === 'DESC' ? -1 : 1;
        //     // if ((a.combined_severity ?? 0.0) < (b.combined_severity ?? 0.0))
        //     //     return sortDirectionSafe === 'DESC' ? 1 : -1;
        //     return 0;
        // });
    } else if (sortBySafe === 'last_published' || sortBySafe === 'release') {
        sorted = dependencies.sort((a: any, b: any) => {
            if (
                (Date.parse(a[sortBySafe]) ?? Date.parse('1970')) >
                (Date.parse(b[sortBySafe]) ?? Date.parse('1970'))
            )
                return sortDirectionSafe === 'DESC' ? -1 : 1;
            if (
                (Date.parse(a[sortBySafe]) ?? Date.parse('1970')) <
                (Date.parse(b[sortBySafe]) ?? Date.parse('1970'))
            )
                return sortDirectionSafe === 'DESC' ? 1 : -1;
            return 0;
        });
    } else if (sortBySafe === 'newest_release') {
        // sorted = dependencies
        //     .map((dep) => {
        //         if (dep['newest_release'] === dep['version']) {
        //             if (dep['is_direct_count'] > 0) {
        //                 return {
        //                     ...dep,
        //                     update_available: false,
        //                     is_direct: true
        //                 };
        //             }
        //             return {
        //                 ...dep,
        //                 update_available: false,
        //                 is_direct: false
        //             };
        //         } else {
        //             if (dep['is_direct_count'] > 0) {
        //                 return {
        //                     ...dep,
        //                     update_available: true,
        //                     is_direct: true
        //                 };
        //             }
        //             return {
        //                 ...dep,
        //                 update_available: true,
        //                 is_direct: false
        //             };
        //         }
        //     })
        //     .filter((dep) => dep.update_available)
        //     .sort((a: any, b: any) => {
        //         return b.is_direct - a.is_direct;
        //     });
    } else if (sortBySafe === 'dev') {
        sorted = dependencies.sort((a: any, b: any) => {
            return b.dev - a.dev;
        });

        if (sortDirectionSafe === 'DESC') sorted.reverse();
    } else if (sortBySafe === 'is_direct_count') {
        sorted = dependencies.sort((a: any, b: any) => {
            return b.is_direct_count - a.is_direct_count;
        });

        if (sortDirectionSafe === 'DESC') sorted.reverse();
    } else if (sortBySafe === 'version') {
        sorted = dependencies.sort((a: any, b: any) => {
            const versionA = a[sortBySafe] ?? '0.0.0';
            const versionB = b[sortBySafe] ?? '0.0.0';

            try {
                if (gt(versionA, versionB)) {
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                }
                if (lt(versionA, versionB)) {
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                }
                return 0;
            } catch (e) {
                console.log('error comparing versions:', e);
                return 0;
            }
        });
    } else {
        sorted = dependencies.sort((a: any, b: any) => {
            if ((a[sortBySafe] ?? '') > (b[sortBySafe] ?? ''))
                return sortDirectionSafe === 'DESC' ? 1 : -1;
            if ((a[sortBySafe] ?? '') < (b[sortBySafe] ?? ''))
                return sortDirectionSafe === 'DESC' ? -1 : 1;
            return 0;
        });
    }

    return sorted;
}

export { sort };
