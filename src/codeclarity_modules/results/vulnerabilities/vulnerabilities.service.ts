import { Injectable } from '@nestjs/common';
import { AnalysesRepository } from 'src/base_modules/analyses/analyses.repository';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { CWERepository } from 'src/codeclarity_modules/knowledge/cwe/cwe.repository';
import { EPSSRepository } from 'src/codeclarity_modules/knowledge/epss/epss.repository';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/nvd/nvd.repository';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/osv/osv.repository';
import { VulnerabilityPolicyService } from 'src/codeclarity_modules/policies/vulnerability/vulnerability.service';
import { Output as SBOMOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import {
    isNoneSeverity,
    isLowSeverity,
    isMediumSeverity,
    isHighSeverity,
    isCriticalSeverity,
    paginate
} from 'src/codeclarity_modules/results/utils/utils';
import {
    AffectedVuln,
    Source,
    Vulnerability,
    VulnerabilityMerged,
    ConflictFlag,
    Output as VulnsOutput
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import {
    AnalysisStats,
    newAnalysisStats
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities2.types';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import { UnknownWorkspace } from 'src/types/error.types';
import { AnalysisResultsService } from '../results.service';
import { SbomUtilsService } from '../sbom/utils/utils';
import { VulnerabilitiesFilterService } from './utils/filter.service';
import { VulnerabilitiesSortService } from './utils/sort.service';
import { VulnerabilitiesUtilsService } from './utils/utils.service';

/** NVD vulnerability description entry */
interface NvdDescription {
    lang: string;
    value: string;
}

/** OSV affected entry with version/range information */
interface OsvAffected {
    ranges?: unknown[];
    versions?: unknown[];
}

/** Analysis config structure for vuln-finder */
interface VulnFinderConfig {
    vulnerabilityPolicy?: string[];
}

/** Analysis config record type */
interface AnalysisConfig {
    'vuln-finder'?: VulnFinderConfig;
}

/** Map OWASP category ID to stats property name */
const OWASP_STATS_MAP: Record<string, keyof AnalysisStats> = {
    '1345': 'number_of_owasp_top_10_2021_a1',
    '1346': 'number_of_owasp_top_10_2021_a2',
    '1347': 'number_of_owasp_top_10_2021_a3',
    '1348': 'number_of_owasp_top_10_2021_a4',
    '1349': 'number_of_owasp_top_10_2021_a5',
    '1352': 'number_of_owasp_top_10_2021_a6',
    '1353': 'number_of_owasp_top_10_2021_a7',
    '1354': 'number_of_owasp_top_10_2021_a8',
    '1355': 'number_of_owasp_top_10_2021_a9',
    '1356': 'number_of_owasp_top_10_2021_a10'
};

/** Convert discrete CIA impact string to continuous value */
function getContinuousFromDiscreteCIA(metric: string): number {
    if (metric === 'COMPLETE') return 1.0; // CVSS 2
    if (metric === 'PARTIAL') return 0.5; // CVSS 2
    if (metric === 'HIGH') return 1.0; // CVSS 3
    if (metric === 'LOW') return 0.5; // CVSS 3
    return 0.0;
}

/** Check if conflict flag indicates no conflict (including empty string from malformed data) */
function isNoConflict(flag: ConflictFlag | string): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    return flag === ConflictFlag.NO_CONFLICT || flag === '';
}

@Injectable()
export class VulnerabilitiesService {
    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        private readonly findingsUtilsService: VulnerabilitiesUtilsService,
        private readonly findingsSortService: VulnerabilitiesSortService,
        private readonly findingsFilterService: VulnerabilitiesFilterService,
        private readonly sbomUtilsService: SbomUtilsService,
        private readonly osvRepository: OSVRepository,
        private readonly nvdRepository: NVDRepository,
        private readonly cweRepository: CWERepository,
        private readonly epssRepository: EPSSRepository,
        private readonly vulnerabilityPolicyService: VulnerabilityPolicyService,
        private readonly analysesRepository: AnalysesRepository
    ) {}

    async getStats(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string,
        ecosystem_filter?: string
    ): Promise<AnalysisStats> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let findingsArrayPrevious: Vulnerability[];
        // let dependencyMapPrevious: { [key: string]: Dependency };

        const sbomOutput: SBOMOutput = await this.sbomUtilsService.getSbomResult(analysisId);

        if (!(workspace in sbomOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        // const dependencyMap: { [key: string]: Dependency } =
        //     sbomOutput.workspaces[workspace].dependencies;
        const findingsArray: Vulnerability[] = await this.findingsUtilsService.getFindingsData(
            analysisId,
            workspace,
            ecosystem_filter
        );

        try {
            findingsArrayPrevious = []; // Initialize to empty array since we're not using previous analysis data
            // const previousAnalysis =
            //     await this.analysisRepo.getMostRecentAnalysisOfProject(projectId);

            // const sbomOutputPrevious: SBOMOutput = await getSbomResult(previousAnalysis.id);

            // if (!(workspace in sbomOutputPrevious.workspaces)) {
            //     throw new UnknownWorkspace();
            // }

            // // dependencyMapPrevious = sbomOutputPrevious.workspaces[workspace].dependencies;
            // findingsArrayPrevious = await getFindingsData(previousAnalysis.id, workspace, ecosystem_filter);
        } catch (error) {
            console.error(error);
            // dependencyMapPrevious = {};
            findingsArrayPrevious = [];
        }

        const wBeforeStats: AnalysisStats = newAnalysisStats();
        const wStats: AnalysisStats = newAnalysisStats();

        let sumSeverity = 0;
        let countseverity = 0;
        let maxSeverity = 0;
        let sumConfidentiality = 0;
        let countConfidentiality = 0;
        let sumIntegrity = 0;
        let countIntegrity = 0;
        let sumAvailability = 0;
        let countAvailability = 0;
        const encounteredDeps = new Set<string>();
        // const encounteredDevDeps = new Set<string>();
        const encounteredVulns = new Set<string>();

        wStats.number_of_issues = findingsArray.length;
        for (const finding of findingsArray) {
            if (!encounteredDeps.has(finding.AffectedDependency)) {
                // let dependency: Dependency | undefined = undefined;
                // if (finding.AffectedDependency in dependencyMap)
                //     dependency = dependencyMap[finding.AffectedDependency];
                // if (dependency && dependency.is_direct)
                //     wStats.number_of_direct_vulnerabilities += 1;
                // if (dependency && dependency.is_transitive)
                //     wStats.number_of_transitive_vulnerabilities += 1;
            }

            if (finding.Severity !== null) {
                sumConfidentiality += getContinuousFromDiscreteCIA(
                    finding.Severity.ConfidentialityImpact
                );
                countConfidentiality += 1;
            }
            if (finding.Severity !== null) {
                sumAvailability += getContinuousFromDiscreteCIA(
                    finding.Severity.AvailabilityImpact
                );
                countAvailability += 1;
            }
            if (finding.Severity !== null) {
                sumIntegrity += getContinuousFromDiscreteCIA(finding.Severity.IntegrityImpact);
                countIntegrity += 1;
            }

            if (finding.Severity !== null) {
                sumSeverity += finding.Severity.Severity;
                countseverity += 1;
            }
            if (finding.Severity !== null) {
                if (finding.Severity.Severity > maxSeverity)
                    maxSeverity = finding.Severity.Severity;
            }

            encounteredDeps.add(finding.AffectedDependency);

            // Only count unique vulnerabilities
            if (!encounteredVulns.has(finding.VulnerabilityId)) {
                this.incrementOwaspStats(wStats, finding.Weaknesses);
                this.incrementSeverityStats(wStats, finding.Severity);
            }

            encounteredVulns.add(finding.VulnerabilityId);
        }

        wStats.number_of_vulnerable_dependencies = encounteredDeps.size;
        wStats.max_severity = maxSeverity;
        wStats.mean_severity = countseverity > 0 ? sumSeverity / countseverity : 0;
        wStats.mean_availability_impact =
            countAvailability > 0 ? sumAvailability / countAvailability : 0;
        wStats.mean_confidentiality_impact =
            countConfidentiality > 0 ? sumConfidentiality / countConfidentiality : 0;
        wStats.mean_integrity_impact = countIntegrity > 0 ? sumIntegrity / countIntegrity : 0;

        sumSeverity = 0;
        countseverity = 0;
        maxSeverity = 0;
        sumConfidentiality = 0;
        countConfidentiality = 0;
        sumIntegrity = 0;
        countIntegrity = 0;
        sumAvailability = 0;
        countAvailability = 0;
        const beforeEncounteredDeps = new Set<string>();
        const beforeEncounteredVulns = new Set<string>();

        wBeforeStats.number_of_issues = findingsArrayPrevious.length;
        for (const finding of findingsArrayPrevious) {
            // let dependency: Dependency | undefined = undefined;

            // if (finding.AffectedDependency in dependencyMapPrevious)
            //     dependency = dependencyMapPrevious[finding.AffectedDependency];

            // if (!encounteredDeps.has(finding.AffectedDependency)) {
            //     if (dependency && dependency.is_direct)
            //         wBeforeStats.number_of_direct_vulnerabilities += 1;
            //     if (dependency && dependency.is_transitive)
            //         wBeforeStats.number_of_transitive_vulnerabilities += 1;
            // }

            if (finding.Severity !== null) {
                sumConfidentiality += getContinuousFromDiscreteCIA(
                    finding.Severity.ConfidentialityImpact
                );
                countConfidentiality += 1;
            }
            if (finding.Severity !== null) {
                sumAvailability += getContinuousFromDiscreteCIA(
                    finding.Severity.AvailabilityImpact
                );
                countAvailability += 1;
            }
            if (finding.Severity !== null) {
                sumIntegrity += getContinuousFromDiscreteCIA(finding.Severity.IntegrityImpact);
                countIntegrity += 1;
            }

            if (finding.Severity !== null) {
                sumSeverity += finding.Severity.Severity;
                countseverity += 1;
            }
            if (finding.Severity !== null) {
                if (finding.Severity.Severity > maxSeverity)
                    maxSeverity = finding.Severity.Severity;
            }
            beforeEncounteredDeps.add(finding.AffectedDependency);

            this.incrementOwaspStats(wBeforeStats, finding.Weaknesses);
            this.incrementSeverityStats(wBeforeStats, finding.Severity);

            beforeEncounteredVulns.add(finding.VulnerabilityId);
        }

        wBeforeStats.number_of_vulnerable_dependencies = beforeEncounteredDeps.size;
        wStats.number_of_vulnerable_dependencies = encounteredDeps.size;
        wBeforeStats.number_of_vulnerabilities = beforeEncounteredVulns.size;
        wStats.number_of_vulnerabilities = encounteredVulns.size;

        wBeforeStats.max_severity = maxSeverity;
        wBeforeStats.mean_severity = countseverity > 0 ? sumSeverity / countseverity : 0;
        wBeforeStats.mean_availability_impact =
            countAvailability > 0 ? sumAvailability / countAvailability : 0;
        wBeforeStats.mean_confidentiality_impact =
            countConfidentiality > 0 ? sumConfidentiality / countConfidentiality : 0;
        wBeforeStats.mean_integrity_impact = countIntegrity > 0 ? sumIntegrity / countIntegrity : 0;

        wStats.number_of_vulnerabilities_diff =
            wStats.number_of_vulnerabilities - wBeforeStats.number_of_vulnerabilities;
        wStats.number_of_vulnerable_dependencies_diff =
            wStats.number_of_vulnerable_dependencies -
            wBeforeStats.number_of_vulnerable_dependencies;
        wStats.number_of_direct_vulnerabilities_diff =
            wStats.number_of_direct_vulnerabilities - wBeforeStats.number_of_direct_vulnerabilities;
        wStats.number_of_transitive_vulnerabilities_diff =
            wStats.number_of_transitive_vulnerabilities -
            wBeforeStats.number_of_transitive_vulnerabilities;
        wStats.mean_severity_diff = wStats.mean_severity - wBeforeStats.mean_severity;
        wStats.max_severity_diff = wStats.max_severity - wBeforeStats.max_severity;
        wStats.number_of_owasp_top_10_2021_a1_diff =
            wStats.number_of_owasp_top_10_2021_a1 - wBeforeStats.number_of_owasp_top_10_2021_a1;
        wStats.number_of_owasp_top_10_2021_a2_diff =
            wStats.number_of_owasp_top_10_2021_a2 - wBeforeStats.number_of_owasp_top_10_2021_a2;
        wStats.number_of_owasp_top_10_2021_a3_diff =
            wStats.number_of_owasp_top_10_2021_a3 - wBeforeStats.number_of_owasp_top_10_2021_a3;
        wStats.number_of_owasp_top_10_2021_a4_diff =
            wStats.number_of_owasp_top_10_2021_a4 - wBeforeStats.number_of_owasp_top_10_2021_a4;
        wStats.number_of_owasp_top_10_2021_a5_diff =
            wStats.number_of_owasp_top_10_2021_a5 - wBeforeStats.number_of_owasp_top_10_2021_a5;
        wStats.number_of_owasp_top_10_2021_a6_diff =
            wStats.number_of_owasp_top_10_2021_a6 - wBeforeStats.number_of_owasp_top_10_2021_a6;
        wStats.number_of_owasp_top_10_2021_a7_diff =
            wStats.number_of_owasp_top_10_2021_a7 - wBeforeStats.number_of_owasp_top_10_2021_a7;
        wStats.number_of_owasp_top_10_2021_a8_diff =
            wStats.number_of_owasp_top_10_2021_a8 - wBeforeStats.number_of_owasp_top_10_2021_a8;
        wStats.number_of_owasp_top_10_2021_a9_diff =
            wStats.number_of_owasp_top_10_2021_a9 - wBeforeStats.number_of_owasp_top_10_2021_a9;
        wStats.number_of_owasp_top_10_2021_a10_diff =
            wStats.number_of_owasp_top_10_2021_a10 - wBeforeStats.number_of_owasp_top_10_2021_a10;
        wStats.number_of_critical_diff =
            wStats.number_of_critical - wBeforeStats.number_of_critical;
        wStats.number_of_high_diff = wStats.number_of_high - wBeforeStats.number_of_high;
        wStats.number_of_medium_diff = wStats.number_of_medium - wBeforeStats.number_of_medium;
        wStats.number_of_low_diff = wStats.number_of_low - wBeforeStats.number_of_low;
        wStats.number_of_none_diff = wStats.number_of_none - wBeforeStats.number_of_none;
        wStats.mean_availability_impact_diff =
            wStats.mean_availability_impact - wBeforeStats.mean_availability_impact;
        wStats.mean_integrity_impact_diff =
            wStats.mean_integrity_impact - wBeforeStats.mean_integrity_impact;
        wStats.mean_confidentiality_impact_diff =
            wStats.mean_confidentiality_impact - wBeforeStats.mean_confidentiality_impact;

        return wStats;
    }

    // eslint-disable-next-line max-params, complexity
    async getVulnerabilities(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string,
        page: number | undefined,
        entries_per_page: number | undefined,
        sort_by: string | undefined,
        sort_direction: string | undefined,
        active_filters_string: string | undefined,
        search_key: string | undefined,
        ecosystem_filter?: string,
        show_blacklisted?: boolean
    ): Promise<PaginatedResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string !== null && active_filters_string !== undefined)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        // GET SBOM DATA
        // const dependenciesArray: Dependency[] = await getSbomData(analysisId, workspace);
        // const dependenciesMap: { [key: string]: Dependency } = {};
        // for (const dep of dependenciesArray) {
        //     dependenciesMap[dep.key] = dep;
        // }
        const findings: Vulnerability[] = await this.findingsUtilsService.getFindingsData(
            analysisId,
            workspace,
            ecosystem_filter
        );

        const findingsMerged: Map<string, VulnerabilityMerged> = new Map<
            string,
            VulnerabilityMerged
        >();
        // For each finding
        for (const finding of findings) {
            const affected: AffectedVuln = {
                Sources: finding.Sources,
                AffectedDependency: finding.AffectedDependency,
                AffectedVersion: finding.AffectedVersion,
                VulnerabilityId: finding.VulnerabilityId,
                OSVMatch: finding.OSVMatch,
                NVDMatch: finding.NVDMatch,
                Severity: finding.Severity,
                Conflict: finding.Conflict
            };
            if (finding.Weaknesses) {
                affected.Weaknesses = finding.Weaknesses;
            }
            // if vuln already in map
            const vuln = findingsMerged.get(finding.VulnerabilityId);
            if (vuln) {
                vuln.Affected.push(affected);
                findingsMerged.set(finding.VulnerabilityId, vuln);
            } else {
                const epss = await this.epssRepository.getByCVE(finding.VulnerabilityId);
                const mergedFinding: VulnerabilityMerged = {
                    Id: finding.Id,
                    Sources: finding.Sources,
                    Vulnerability: finding.VulnerabilityId,
                    Severity: finding.Severity,
                    Affected: [affected],
                    Description: '',
                    Conflict: finding.Conflict,
                    VLAI: [],
                    EPSS: {
                        Score: epss.score,
                        Percentile: epss.percentile
                    }
                };
                if (finding.Weaknesses) {
                    mergedFinding.Weaknesses = finding.Weaknesses;
                }
                if (finding.NVDMatch) {
                    const nvdVuln = finding.NVDMatch.Vulnerability;
                    if (nvdVuln && typeof nvdVuln === 'object' && 'Vlai_score' in nvdVuln) {
                        mergedFinding.VLAI.push({
                            Source: Source.Nvd,
                            Score: String(nvdVuln.Vlai_score),
                            Confidence: Number(nvdVuln.Vlai_confidence)
                        });
                    }
                }
                if (finding.OSVMatch) {
                    const osvVuln = finding.OSVMatch.Vulnerability;
                    if (osvVuln && typeof osvVuln === 'object' && 'Vlai_score' in osvVuln) {
                        mergedFinding.VLAI.push({
                            Source: Source.Osv,
                            Score: String(osvVuln.Vlai_score),
                            Confidence: Number(osvVuln.Vlai_confidence)
                        });
                    }
                }

                // Check for source disagreements
                // For PHP vulnerabilities, the OSVMatch is often missing even when OSV data exists
                // So we check if both NVD data exists and it's a CVE (which likely has OSV data)
                const isCve = finding.VulnerabilityId.includes('CVE-');

                if (
                    finding.NVDMatch &&
                    isCve &&
                    isNoConflict(mergedFinding.Conflict.ConflictFlag)
                ) {
                    // For CVEs with NVD data, assume potential source disagreement
                    // This is a workaround for the OSV matching issue in PHP vulnerabilities
                    mergedFinding.Conflict.ConflictFlag = ConflictFlag.MATCH_POSSIBLE_INCORRECT;
                }

                findingsMerged.set(finding.VulnerabilityId, mergedFinding);
            }
        }

        // Get blacklisted vulnerabilities from policies
        const { vulnerabilities: blacklistedVulns, policies: policyNames } =
            await this.getBlacklistedVulnerabilities(analysisId, orgId);

        // Mark blacklisted vulnerabilities and apply filtering
        const allFindings = Array.from(findingsMerged.values()).map((finding) => {
            const isBlacklisted = blacklistedVulns.has(finding.Vulnerability);
            const policyName = policyNames.get(finding.Vulnerability);
            const blacklistedByPolicies = isBlacklisted && policyName ? [policyName] : [];

            return {
                ...finding,
                is_blacklisted: isBlacklisted,
                blacklisted_by_policies: blacklistedByPolicies
            } as VulnerabilityMerged;
        });

        // Filter out blacklisted vulnerabilities if show_blacklisted is false
        const findingsToProcess =
            show_blacklisted === false
                ? allFindings.filter((finding) => !finding.is_blacklisted)
                : allFindings;

        const [filtered, filterCount] = this.findingsFilterService.filter(
            findingsToProcess,
            search_key,
            active_filters
        );

        const sorted = this.findingsSortService.sort(filtered, sort_by, sort_direction);

        const paginated = paginate<VulnerabilityMerged>(
            sorted,
            filtered.length,
            { currentPage: page, entriesPerPage: entries_per_page },
            { maxEntriesPerPage: 100, defaultEntriesPerPage: 20 }
        );

        paginated.filter_count = filterCount;

        let paginatedVulns: VulnerabilityMerged[] = [];

        if (paginated.data) {
            paginatedVulns = paginated.data;
        }

        // Attach additional info
        for (const finding of paginatedVulns) {
            // Attach vulnerability description
            const isCve = finding.Vulnerability.includes('CVE-');
            const isGhsa = finding.Vulnerability.includes('GHSA-');

            let nvdDescription = '';
            let osvDescription = '';
            let osvSummary = '';
            let nvdVuln = null;
            let osvVuln = null;

            if (isCve) {
                nvdVuln = await this.nvdRepository.getVulnWithoutFailing(finding.Vulnerability);

                if (nvdVuln) {
                    const descriptions = nvdVuln.descriptions as NvdDescription[] | undefined;
                    nvdDescription = descriptions?.[0]?.value ?? '';
                }

                osvVuln = await this.osvRepository.getVulnByCVEIDWithoutFailing(
                    finding.Vulnerability
                );

                if (osvVuln) {
                    osvDescription = osvVuln.details;
                    osvSummary = osvVuln.summary;
                }
            }

            if (isGhsa) {
                osvVuln = await this.osvRepository.getVulnByOSVIDWithoutFailing(
                    finding.Vulnerability
                );

                if (osvVuln) {
                    osvDescription = osvVuln.details;
                    osvSummary = osvVuln.summary;
                }
            }

            // Check for source disagreements when both NVD and OSV data exist
            if (nvdVuln && osvVuln && isNoConflict(finding.Conflict.ConflictFlag)) {
                // Check if OSV has specific version/range data
                const affected = osvVuln.affected as OsvAffected[] | undefined;
                const osvHasRanges = affected?.some(
                    (a) => (a.ranges?.length ?? 0) > 0 || (a.versions?.length ?? 0) > 0
                );

                // When OSV has specific version data and both sources exist,
                // mark as potential disagreement since they often have different interpretations
                if (osvHasRanges) {
                    finding.Conflict.ConflictFlag = ConflictFlag.MATCH_POSSIBLE_INCORRECT;
                }
            }

            if (osvDescription === '' && nvdDescription !== '')
                finding.Description = nvdDescription;
            else {
                if (osvSummary.length > 0) {
                    osvSummary = osvSummary.charAt(0).toUpperCase() + osvSummary.slice(1);
                }
                if (osvDescription.length > 0) {
                    osvDescription = this.cleanOsvDescription(osvDescription);
                    osvDescription =
                        osvDescription.charAt(0).toUpperCase() + osvDescription.slice(1);
                    if (!osvDescription.endsWith('.') && !osvDescription.endsWith('```')) {
                        osvDescription += '.';
                    }
                }
                finding.Description = `#### ${osvSummary}.\n\n${osvDescription}`;
            }

            // Attach weakness info
            if (finding.Weaknesses) {
                for (const weakness of finding.Weaknesses) {
                    const cwe = await this.cweRepository.getCWEWithoutFailing(
                        weakness.WeaknessId.replace('CWE-', '')
                    );

                    if (cwe) {
                        weakness.WeaknessName = cwe.name;
                        weakness.WeaknessDescription = cwe.description;
                        weakness.WeaknessExtendedDescription = cwe.extended_description;
                    } else {
                        weakness.WeaknessName = '';
                        weakness.WeaknessDescription = '';
                        weakness.WeaknessExtendedDescription = '';
                    }
                }
            }

            // for (const affected of finding.Affected) {
            //     const parentGraph: Array<string> = await getImportPaths(
            //         dependenciesMap,
            //         affected.AffectedDependency,
            //         '',
            //         new Array<string>(),
            //         new Set<string>()
            //     );

            //     if (affected.AffectedDependencyObject) {
            //         affected.AffectedDependencyFilePath =
            //             affected.AffectedDependencyObject.file_path;
            //         affected.AffectedDependencyImportPaths = parentGraph;
            //         affected.AffectedDependencyName = affected.AffectedDependencyObject.name;
            //         affected.AffectedDependencyVersion = affected.AffectedDependencyObject.version;
            //     }
            //     // Purging data not needed by the client
            //     delete affected.AffectedDependencyObject;
            // }
        }

        paginated.data = paginatedVulns;
        return paginated;
    }

    async getStatus(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<StatusResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const vulnsOutput: VulnsOutput = await this.findingsUtilsService.getVulnsResult(analysisId);

        if (vulnsOutput.analysis_info.private_errors.length) {
            return {
                stage_start: vulnsOutput.analysis_info.analysis_start_time,
                stage_end: vulnsOutput.analysis_info.analysis_end_time,
                public_errors: vulnsOutput.analysis_info.public_errors,
                private_errors: vulnsOutput.analysis_info.private_errors
            };
        }
        return {
            stage_start: vulnsOutput.analysis_info.analysis_start_time,
            stage_end: vulnsOutput.analysis_info.analysis_end_time
        };
    }

    private cleanOsvDescription(description: string): string {
        const sections = [];
        let parsingHeader = false;
        let text = '';

        for (const char of description) {
            if (char === '#' && parsingHeader === false) {
                if (text !== '') sections.push(text);
                parsingHeader = true;
                text = '';
                continue;
            }

            if (char !== '#') parsingHeader = false;

            if (char !== '#') text += char;
        }

        if (text !== '') {
            sections.push(text);
        }

        const selectedSections = [];

        let index = -1;
        for (const section of sections) {
            index += 1;
            if (index === 0) {
                selectedSections.push(section);
                continue;
            }
            if (section.includes('```')) {
                selectedSections.push(section);
                continue;
            }
        }

        if (selectedSections.length > 0) {
            let newSection = '';
            const section = selectedSections[selectedSections.length - 1]!;
            let trimEndNewLines = true;
            for (let i = section.length - 1; i >= 0; i--) {
                if (section[i] !== '\n') {
                    trimEndNewLines = false;
                }
                if (!trimEndNewLines) {
                    newSection += section[i]!;
                }
            }
            selectedSections[selectedSections.length - 1] = newSection.split('').reverse().join('');
        }

        return selectedSections.join('\n');
    }

    /**
     * Increment OWASP Top 10 stats based on weakness information
     */
    private incrementOwaspStats(
        stats: AnalysisStats,
        weaknesses: { OWASPTop10Id: string }[] | undefined
    ): void {
        if (!weaknesses || weaknesses.length === 0) return;

        for (const weakness of weaknesses) {
            const statKey = OWASP_STATS_MAP[weakness.OWASPTop10Id];
            if (statKey) {
                stats[statKey] += 1;
            }
        }
    }

    /**
     * Increment severity distribution stats based on severity value
     */
    private incrementSeverityStats(
        stats: AnalysisStats,
        severity: { Severity: number } | null | undefined
    ): void {
        if (severity === null || severity === undefined) {
            stats.number_of_none += 1;
            return;
        }

        const severityValue = severity.Severity;
        if (isNoneSeverity(severityValue)) stats.number_of_none += 1;
        else if (isLowSeverity(severityValue)) stats.number_of_low += 1;
        else if (isMediumSeverity(severityValue)) stats.number_of_medium += 1;
        else if (isHighSeverity(severityValue)) stats.number_of_high += 1;
        else if (isCriticalSeverity(severityValue)) stats.number_of_critical += 1;
    }

    /**
     * Get blacklisted vulnerabilities from analysis configuration
     */
    private async getBlacklistedVulnerabilities(
        analysisId: string,
        orgId: string
    ): Promise<{ vulnerabilities: Set<string>; policies: Map<string, string> }> {
        try {
            // Get the analysis to access its configuration
            const analysis = await this.analysesRepository.getAnalysisById(analysisId);

            if (!analysis.config || typeof analysis.config !== 'object') {
                return { vulnerabilities: new Set(), policies: new Map() };
            }

            // Extract vulnerability policies from vuln-finder configuration
            const config = analysis.config as AnalysisConfig;
            const vulnFinderConfig = config['vuln-finder'];
            if (
                !vulnFinderConfig?.vulnerabilityPolicy ||
                !Array.isArray(vulnFinderConfig.vulnerabilityPolicy)
            ) {
                return { vulnerabilities: new Set(), policies: new Map() };
            }

            const policyIds = vulnFinderConfig.vulnerabilityPolicy.filter(
                (id): id is string => typeof id === 'string' && id.trim() !== ''
            );
            if (policyIds.length === 0) {
                return { vulnerabilities: new Set(), policies: new Map() };
            }

            // Fetch all vulnerability policies using the unified policy table
            const blacklistedVulns = new Set<string>();
            const policyNames = new Map<string, string>();

            for (const policyId of policyIds) {
                await this.fetchPolicyVulnerabilities(
                    orgId,
                    policyId,
                    blacklistedVulns,
                    policyNames
                );
            }

            return { vulnerabilities: blacklistedVulns, policies: policyNames };
        } catch (err) {
            console.warn(
                `Could not get blacklisted vulnerabilities for analysis ${analysisId}:`,
                (err as Error).message
            );
            return { vulnerabilities: new Set(), policies: new Map() };
        }
    }

    /**
     * Fetch vulnerabilities from a single policy and add to the sets
     */
    private async fetchPolicyVulnerabilities(
        orgId: string,
        policyId: string,
        blacklistedVulns: Set<string>,
        policyNames: Map<string, string>
    ): Promise<void> {
        try {
            // Get policy directly from the unified policy table
            const policy = await this.vulnerabilityPolicyService.get(orgId, policyId, {
                userId: 'system',
                roles: [],
                activated: true
            } as unknown as AuthenticatedUser);
            if (policy?.content && Array.isArray(policy.content)) {
                for (const vuln of policy.content) {
                    blacklistedVulns.add(vuln);
                    policyNames.set(vuln, policy.name);
                }
            }
        } catch (err) {
            // Skip invalid policy IDs
            console.warn(
                `Could not fetch vulnerability policy ${policyId}:`,
                (err as Error).message
            );
        }
    }
}
