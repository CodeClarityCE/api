import { Injectable } from '@nestjs/common';
import {
    isNoneSeverity,
    isLowSeverity,
    isMediumSeverity,
    isHighSeverity,
    isCriticalSeverity
} from 'src/codeclarity_modules/results/utils/utils';
import {
    ConflictFlag,
    VulnerabilityMerged
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';


@Injectable()
export class VulnerabilitiesFilterService {
    constructor() {}

    filter(
        vulnerabilities: VulnerabilityMerged[],
        searchKey: string | undefined,
        activeFilters: string[] | undefined
    ): [VulnerabilityMerged[], Record<string, number>] {
        // Validation of input
        let searchkeySafe: string;
        let activeFiltersSafe: string[];
        const possibleFilters: string[] = [
            'owasp_top_10_2021_a1',
            'owasp_top_10_2021_a2',
            'owasp_top_10_2021_a3',
            'owasp_top_10_2021_a4',
            'owasp_top_10_2021_a5',
            'owasp_top_10_2021_a6',
            'owasp_top_10_2021_a7',
            'owasp_top_10_2021_a8',
            'owasp_top_10_2021_a9',
            'owasp_top_10_2021_a10',
            'owasp_uncategorized',
            'patchable',
            'partially_patchable',
            'not_patchable',
            'severity_critical',
            'severity_high',
            'severity_medium',
            'severity_low',
            'severity_none',
            'availability_impact',
            'confidentiality_impact',
            'integrity_impact',
            'hide_correct_matching',
            'hide_incorrect_matching',
            'hide_possibly_incorrect_matching'
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

        function filterBySearchKey(vulnerabilities: VulnerabilityMerged[]): VulnerabilityMerged[] {
            if (searchKey === '') {
                return vulnerabilities;
            }

            const toReturn = [];
            searchKey = searchkeySafe.toLocaleLowerCase();

            for (const vulnerability of vulnerabilities) {
                for (const affected of vulnerability.Affected) {
                    if (
                        affected.AffectedDependency !== null &&
                        affected.AffectedDependency.toLocaleLowerCase().includes(searchKey)
                    ) {
                        toReturn.push(vulnerability);
                        continue;
                    }
                }
                if (
                    vulnerability.Vulnerability !== null &&
                    vulnerability.Vulnerability.toLocaleLowerCase().includes(searchKey)
                ) {
                    toReturn.push(vulnerability);
                    continue;
                }
            }

            return toReturn;
        }

        function filterByOptions(
            vulnerabilities: VulnerabilityMerged[],
            filters: string[]
        ): VulnerabilityMerged[] {
            const toReturn = [];

            for (const vulnerability of vulnerabilities) {
                if (vulnerability.Weaknesses !== null && vulnerability.Weaknesses !== undefined) {
                    if (filters.includes('owasp_top_10_2021_a1')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1345') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a2')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1346') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a3')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1347') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a4')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1348') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a5')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1349') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a6')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1352') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a7')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1353') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a8')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1354') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a9')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1355') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_top_10_2021_a10')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id === '1356') found = true;
                            break;
                        }
                        if (!found) continue;
                    }
                    if (filters.includes('owasp_uncategorized')) {
                        let found = false;
                        for (const weakness of vulnerability.Weaknesses) {
                            if (weakness.OWASPTop10Id !== '') found = true;
                            break;
                        }
                        if (found) continue;
                    }
                }

                // if (filters.includes('patchable')) {
                //     if (vulnerability.PatchType !== PatchType.Full) continue;
                // }
                // if (filters.includes('partially_patchable')) {
                //     if (vulnerability.PatchType !== PatchType.Partial) continue;
                // }
                // if (filters.includes('not_patchable')) {
                //     if (vulnerability.PatchType !== PatchType.None) continue;
                // }

                if (filters.includes('severity_critical')) {
                    if (!isCriticalSeverity(vulnerability.Severity.Severity)) continue;
                }
                if (filters.includes('severity_high')) {
                    if (!isHighSeverity(vulnerability.Severity.Severity)) continue;
                }
                if (filters.includes('severity_medium')) {
                    if (!isMediumSeverity(vulnerability.Severity.Severity)) continue;
                }
                if (filters.includes('severity_low')) {
                    if (!isLowSeverity(vulnerability.Severity.Severity)) continue;
                }
                if (filters.includes('severity_none')) {
                    if (!isNoneSeverity(vulnerability.Severity.Severity)) continue;
                }

                if (filters.includes('availability_impact')) {
                    if (
                        (vulnerability.Severity?.AvailabilityImpact === 'NONE') ||
                        vulnerability.Severity.AvailabilityImpact === ''
                    )
                        continue;
                }
                if (filters.includes('confidentiality_impact')) {
                    if (
                        (vulnerability.Severity?.ConfidentialityImpact === 'NONE') ||
                        vulnerability.Severity.ConfidentialityImpact === ''
                    )
                        continue;
                }
                if (filters.includes('integrity_impact')) {
                    if (
                        (vulnerability.Severity?.IntegrityImpact === 'NONE') ||
                        vulnerability.Severity.IntegrityImpact === ''
                    )
                        continue;
                }
                if (filters.includes('hide_correct_matching')) {
                    if (
                        vulnerability.Conflict.ConflictFlag === ConflictFlag.MATCH_CORRECT ||
                        (vulnerability.Conflict.ConflictFlag as any) === 'MATCH_CORRECT'
                    )
                        continue;
                }
                if (filters.includes('hide_incorrect_matching')) {
                    if (
                        vulnerability.Conflict.ConflictFlag === ConflictFlag.MATCH_INCORRECT ||
                        (vulnerability.Conflict.ConflictFlag as any) === 'MATCH_INCORRECT'
                    )
                        continue;
                }
                if (filters.includes('hide_possibly_incorrect_matching')) {
                    if (
                        vulnerability.Conflict.ConflictFlag ===
                            ConflictFlag.MATCH_POSSIBLE_INCORRECT ||
                        (vulnerability.Conflict.ConflictFlag as any) === 'MATCH_POSSIBLE_INCORRECT'
                    ) {
                        continue;
                    }
                }

                toReturn.push(vulnerability);
            }

            return toReturn;
        }

        const filteredBySearchKey = filterBySearchKey(vulnerabilities);

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
}
