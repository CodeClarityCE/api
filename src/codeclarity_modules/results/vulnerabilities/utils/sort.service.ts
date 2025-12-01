import { Injectable } from '@nestjs/common';
import { gt, lt } from 'semver';
import { VulnerabilityMerged } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';

@Injectable()
export class VulnerabilitiesSortService {
    sort(
        vulnerabilities: VulnerabilityMerged[],
        sortBy: string | undefined,
        sortDirection: string | undefined
    ): VulnerabilityMerged[] {
        // Defaults
        const ALLOWED_SORT_BY = [
            'cve',
            'dep_name',
            'dep_version',
            'file_path',
            'severity',
            'weakness',
            'exploitability',
            'owasp_top_10'
        ];
        const DEFAULT_SORT = 'severity';
        const DEFAULT_SORT_DIRECTION = 'DESC';

        const mapping: Record<string, string> = {
            cve: 'Vulnerability'
        };

        // Validation of input
        let sortBySafe: string;
        let sortDirectionSafe: string;

        if (sortBy === null || sortBy === undefined || !ALLOWED_SORT_BY.includes(sortBy)) {
            sortBySafe = DEFAULT_SORT;
        } else {
            sortBySafe = sortBy;
        }

        if (
            sortDirection === null ||
            sortDirection === undefined ||
            (sortDirection !== 'DESC' && sortDirection !== 'ASC')
        ) {
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
        let sorted: VulnerabilityMerged[] = [];

        if (sortBySafe === 'severity') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                if ((a.Severity?.Severity ?? 0.0) > (b.Severity?.Severity ?? 0.0))
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if ((a.Severity?.Severity ?? 0.0) < (b.Severity?.Severity ?? 0.0))
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                return 0;
            });
        }
        // else if (sortBySafe === 'dep_name') {
        //     sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
        //         if ((a.Affected?.[0]?.AffectedDependency ?? '') > (b.Affected?.[0]?.AffectedDependency ?? ''))
        //             return sortDirectionSafe === 'DESC' ? 1 : -1;
        //         if ((a.Affected?.[0]?.AffectedDependency ?? '') < (b.Affected?.[0]?.AffectedDependency ?? ''))
        //             return sortDirectionSafe === 'DESC' ? -1 : 1;
        //         return 0;
        //     });
        // }
        else if (sortBySafe === 'dep_version') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                const versionA = a.Affected?.[0]?.AffectedVersion ?? '0.0.0';
                const versionB = b.Affected?.[0]?.AffectedVersion ?? '0.0.0';

                if (gt(versionA, versionB)) {
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                }
                if (lt(versionA, versionB)) {
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                }
                return 0;
            });
        } else if (sortBySafe === 'exploitability') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                if ((a.Severity?.Exploitability ?? 0.0) > (b.Severity?.Exploitability ?? 0.0))
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if ((a.Severity?.Exploitability ?? 0.0) < (b.Severity?.Exploitability ?? 0.0))
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                return 0;
            });
        } else if (sortBySafe === 'owasp_top_10') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                if (
                    (a.Weaknesses === null ||
                        a.Weaknesses === undefined ||
                        a.Weaknesses.length === 0 ||
                        a.Weaknesses[0]!.OWASPTop10Id === '') &&
                    (b.Weaknesses === null ||
                        b.Weaknesses === undefined ||
                        b.Weaknesses.length === 0 ||
                        b.Weaknesses[0]!.OWASPTop10Id === '')
                )
                    return 0;
                if (
                    a.Weaknesses === null ||
                    a.Weaknesses === undefined ||
                    a.Weaknesses.length === 0 ||
                    a.Weaknesses[0]!.OWASPTop10Id === ''
                )
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                if (
                    b.Weaknesses === null ||
                    b.Weaknesses === undefined ||
                    b.Weaknesses.length === 0 ||
                    b.Weaknesses[0]!.OWASPTop10Id === ''
                )
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if (
                    parseInt(a.Weaknesses[0]!.OWASPTop10Id) >
                    parseInt(b.Weaknesses[0]!.OWASPTop10Id)
                )
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                if (
                    parseInt(a.Weaknesses[0]!.OWASPTop10Id) <
                    parseInt(b.Weaknesses[0]!.OWASPTop10Id)
                )
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                return 0;
            });
        } else if (sortBySafe === 'weakness') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                if (
                    (a.Weaknesses === null ||
                        a.Weaknesses === undefined ||
                        a.Weaknesses.length === 0 ||
                        a.Weaknesses[0]!.WeaknessId === '') &&
                    (b.Weaknesses === null ||
                        b.Weaknesses === undefined ||
                        b.Weaknesses.length === 0 ||
                        b.Weaknesses[0]!.WeaknessId === '')
                )
                    return 0;
                if (
                    a.Weaknesses === null ||
                    a.Weaknesses === undefined ||
                    a.Weaknesses.length === 0 ||
                    a.Weaknesses[0]!.WeaknessId === ''
                )
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if (
                    b.Weaknesses === null ||
                    b.Weaknesses === undefined ||
                    b.Weaknesses.length === 0 ||
                    b.Weaknesses[0]!.WeaknessId === ''
                )
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                if (
                    (parseInt(a.Weaknesses[0]!.WeaknessId.replace('CWE-', '')) ?? 0) >
                    (parseInt(b.Weaknesses[0]!.WeaknessId.replace('CWE-', '')) ?? 0)
                )
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if (
                    (parseInt(a.Weaknesses[0]!.WeaknessId.replace('CWE-', '')) ?? 0) <
                    (parseInt(b.Weaknesses[0]!.WeaknessId.replace('CWE-', '')) ?? 0)
                )
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                return 0;
            });
        } else if (sortBySafe === 'Vulnerability') {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                if ((a.Vulnerability ?? '') > (b.Vulnerability ?? ''))
                    return sortDirectionSafe === 'DESC' ? -1 : 1;
                if ((a.Vulnerability ?? '') < (b.Vulnerability ?? ''))
                    return sortDirectionSafe === 'DESC' ? 1 : -1;
                return 0;
            });
        } else {
            sorted = vulnerabilities.sort((a: VulnerabilityMerged, b: VulnerabilityMerged) => {
                const aRecord = a as unknown as Record<string, unknown>;
                const bRecord = b as unknown as Record<string, unknown>;
                const aRaw = aRecord[sortBySafe];
                const bRaw = bRecord[sortBySafe];
                // Only compare primitive values to avoid [object Object] stringification
                const aVal = typeof aRaw === 'string' || typeof aRaw === 'number' ? aRaw : '';
                const bVal = typeof bRaw === 'string' || typeof bRaw === 'number' ? bRaw : '';
                if (aVal > bVal) return sortDirectionSafe === 'DESC' ? 1 : -1;
                if (aVal < bVal) return sortDirectionSafe === 'DESC' ? -1 : 1;
                return 0;
            });
        }

        return sorted;
    }
}
