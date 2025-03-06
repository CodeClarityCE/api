import { Injectable } from '@nestjs/common';
import { PaginatedResponse } from 'src/types/apiResponses.types';
import {
    AffectedVuln,
    Vulnerability,
    VulnerabilityMerged
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { AnalysisResultsService } from '../results.service';
import {
    isNoneSeverity,
    isLowSeverity,
    isMediumSeverity,
    isHighSeverity,
    isCriticalSeverity,
    paginate
} from 'src/codeclarity_modules/results/utils/utils';
import {
    getFindingsData,
    getVulnsResult
} from 'src/codeclarity_modules/results/vulnerabilities/utils/utils';
import { filter } from 'src/codeclarity_modules/results/vulnerabilities/utils/filter';
import { sort } from 'src/codeclarity_modules/results/vulnerabilities/utils/sort';
import { UnknownWorkspace } from 'src/types/error.types';
import { Output as SBOMOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { getSbomResult } from '../sbom/utils/utils';
import { Output as VulnsOutput } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { AnalysisStats, newAnalysisStats } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities2.types';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { CWE } from 'src/codeclarity_modules/knowledge/cwe/cwe.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';

@Injectable()
export class FindingsService {
    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        @InjectRepository(NVD, 'knowledge')
        private nvdRepository: Repository<NVD>,
        @InjectRepository(OSV, 'knowledge')
        private osvRepository: Repository<OSV>,
        @InjectRepository(CWE, 'knowledge')
        private cweRepository: Repository<CWE>,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getStats(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string
    ): Promise<AnalysisStats> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const owaspTop102021CweCategoryIds = [
            '1345',
            '1346',
            '1347',
            '1348',
            '1349',
            '1352',
            '1353',
            '1354',
            '1355',
            '1356'
        ];

        function getContinuousFromDiscreteCIA(metric: string): number {
            if (metric == 'COMPLETE') return 1.0; // CVSS 2
            if (metric == 'PARTIAL') return 0.5; // CVSS 2
            if (metric == 'HIGH') return 1.0; // CVSS 3
            if (metric == 'LOW') return 0.5; // CVSS 3
            return 0.0;
        }

        let findingsArrayPrevious: Vulnerability[];
        // let dependencyMapPrevious: { [key: string]: Dependency };

        const sbomOutput: SBOMOutput = await getSbomResult(analysisId, this.resultRepository);

        if (!(workspace in sbomOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        // const dependencyMap: { [key: string]: Dependency } =
        //     sbomOutput.workspaces[workspace].dependencies;
        const findingsArray: Vulnerability[] = await getFindingsData(
            analysisId,
            workspace,
            this.resultRepository
        );

        try {
            throw new Error('Method not implemented.');
            // const previousAnalysis =
            //     await this.analysisRepo.getMostRecentAnalysisOfProject(projectId);

            // const sbomOutputPrevious: SBOMOutput = await getSbomResult(previousAnalysis.id);

            // if (!(workspace in sbomOutputPrevious.workspaces)) {
            //     throw new UnknownWorkspace();
            // }

            // // dependencyMapPrevious = sbomOutputPrevious.workspaces[workspace].dependencies;
            // findingsArrayPrevious = await getFindingsData(previousAnalysis.id, workspace);
        } catch (error) {
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

            if (finding.Severity != null) {
                sumConfidentiality += getContinuousFromDiscreteCIA(
                    finding.Severity.ConfidentialityImpact
                );
                countConfidentiality += 1;
            }
            if (finding.Severity != null) {
                sumAvailability += getContinuousFromDiscreteCIA(
                    finding.Severity.AvailabilityImpact
                );
                countAvailability += 1;
            }
            if (finding.Severity != null) {
                sumIntegrity += getContinuousFromDiscreteCIA(finding.Severity.IntegrityImpact);
                countIntegrity += 1;
            }

            if (finding.Severity != null) {
                sumSeverity += finding.Severity.Severity;
                countseverity += 1;
            }
            if (finding.Severity != null) {
                if (finding.Severity.Severity > maxSeverity)
                    maxSeverity = finding.Severity.Severity;
            }

            encounteredDeps.add(finding.AffectedDependency);

            // Only count unique vulnerabilities
            if (!encounteredVulns.has(finding.VulnerabilityId)) {
                if (finding.Weaknesses && finding.Weaknesses.length > 0) {
                    for (const weakness of finding.Weaknesses) {
                        if (owaspTop102021CweCategoryIds.includes(weakness.OWASPTop10Id)) {
                            switch (weakness.OWASPTop10Id) {
                                case '1345':
                                    wStats.number_of_owasp_top_10_2021_a1 += 1;
                                    break;
                                case '1346':
                                    wStats.number_of_owasp_top_10_2021_a2 += 1;
                                    break;
                                case '1347':
                                    wStats.number_of_owasp_top_10_2021_a3 += 1;
                                    break;
                                case '1348':
                                    wStats.number_of_owasp_top_10_2021_a4 += 1;
                                    break;
                                case '1349':
                                    wStats.number_of_owasp_top_10_2021_a5 += 1;
                                    break;
                                case '1352':
                                    wStats.number_of_owasp_top_10_2021_a6 += 1;
                                    break;
                                case '1353':
                                    wStats.number_of_owasp_top_10_2021_a7 += 1;
                                    break;
                                case '1354':
                                    wStats.number_of_owasp_top_10_2021_a8 += 1;
                                    break;
                                case '1355':
                                    wStats.number_of_owasp_top_10_2021_a9 += 1;
                                    break;
                                case '1356':
                                    wStats.number_of_owasp_top_10_2021_a10 += 1;
                                    break;
                            }
                        }
                    }
                }

                if (finding.Severity != null) {
                    const severity = finding.Severity.Severity;
                    if (isNoneSeverity(severity)) wStats.number_of_none += 1;
                    else if (isLowSeverity(severity)) wStats.number_of_low += 1;
                    else if (isMediumSeverity(severity)) wStats.number_of_medium += 1;
                    else if (isHighSeverity(severity)) wStats.number_of_high += 1;
                    else if (isCriticalSeverity(severity)) wStats.number_of_critical += 1;
                } else if (finding.Severity == null) wStats.number_of_none += 1;
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

            if (finding.Severity != null) {
                sumConfidentiality += getContinuousFromDiscreteCIA(
                    finding.Severity.ConfidentialityImpact
                );
                countConfidentiality += 1;
            }
            if (finding.Severity != null) {
                sumAvailability += getContinuousFromDiscreteCIA(
                    finding.Severity.AvailabilityImpact
                );
                countAvailability += 1;
            }
            if (finding.Severity != null) {
                sumIntegrity += getContinuousFromDiscreteCIA(finding.Severity.IntegrityImpact);
                countIntegrity += 1;
            }

            if (finding.Severity != null) {
                sumSeverity += finding.Severity.Severity;
                countseverity += 1;
            }
            if (finding.Severity != null) {
                if (finding.Severity.Severity > maxSeverity)
                    maxSeverity = finding.Severity.Severity;
            }
            beforeEncounteredDeps.add(finding.AffectedDependency);

            if (finding.Weaknesses && finding.Weaknesses.length > 0) {
                for (const weakness of finding.Weaknesses) {
                    if (owaspTop102021CweCategoryIds.includes(weakness.OWASPTop10Id)) {
                        switch (weakness.OWASPTop10Id) {
                            case '1345':
                                wBeforeStats.number_of_owasp_top_10_2021_a1 += 1;
                                break;
                            case '1346':
                                wBeforeStats.number_of_owasp_top_10_2021_a2 += 1;
                                break;
                            case '1347':
                                wBeforeStats.number_of_owasp_top_10_2021_a3 += 1;
                                break;
                            case '1348':
                                wBeforeStats.number_of_owasp_top_10_2021_a4 += 1;
                                break;
                            case '1349':
                                wBeforeStats.number_of_owasp_top_10_2021_a5 += 1;
                                break;
                            case '1352':
                                wBeforeStats.number_of_owasp_top_10_2021_a6 += 1;
                                break;
                            case '1353':
                                wBeforeStats.number_of_owasp_top_10_2021_a7 += 1;
                                break;
                            case '1354':
                                wBeforeStats.number_of_owasp_top_10_2021_a8 += 1;
                                break;
                            case '1355':
                                wBeforeStats.number_of_owasp_top_10_2021_a9 += 1;
                                break;
                            case '1356':
                                wBeforeStats.number_of_owasp_top_10_2021_a10 += 1;
                                break;
                        }
                    }
                }
            }

            if (finding.Severity != null) {
                const severity = finding.Severity.Severity;
                if (isNoneSeverity(severity)) wBeforeStats.number_of_none += 1;
                else if (isLowSeverity(severity)) wBeforeStats.number_of_low += 1;
                else if (isMediumSeverity(severity)) wBeforeStats.number_of_medium += 1;
                else if (isHighSeverity(severity)) wBeforeStats.number_of_high += 1;
                else if (isCriticalSeverity(severity)) wBeforeStats.number_of_critical += 1;
            } else if (finding.Severity == null) wBeforeStats.number_of_none += 1;

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
        search_key: string | undefined
    ): Promise<PaginatedResponse> {
        // Check if the user is allowed to view this analysis result
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string != null)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        // GET SBOM DATA
        // const dependenciesArray: Dependency[] = await getSbomData(analysisId, workspace);
        // const dependenciesMap: { [key: string]: Dependency } = {};
        // for (const dep of dependenciesArray) {
        //     dependenciesMap[dep.key] = dep;
        // }
        const findings: Vulnerability[] = await getFindingsData(
            analysisId,
            workspace,
            this.resultRepository
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
                Weaknesses: finding.Weaknesses
            };
            // if vuln already in map
            const vuln = findingsMerged.get(finding.VulnerabilityId);
            if (vuln) {
                vuln.Affected.push(affected);
                findingsMerged.set(finding.VulnerabilityId, vuln);
            } else {
                const mergedFinding: VulnerabilityMerged = {
                    Id: finding.Id,
                    Sources: finding.Sources,
                    Vulnerability: finding.VulnerabilityId,
                    Severity: finding.Severity,
                    Weaknesses: finding.Weaknesses,
                    Affected: [affected],
                    Description: '',
                    WinningSource: ''
                };
                findingsMerged.set(finding.VulnerabilityId, mergedFinding);
            }
        }

        // Filter, sort and paginate the dependnecies list
        const [filtered, filterCount] = filter(
            Array.from(findingsMerged.values()),
            search_key,
            active_filters
        );
        const sorted = sort(filtered, sort_by, sort_direction);

        const paginated = paginate<VulnerabilityMerged>(
            sorted,
            Array.from(findingsMerged.values()).length,
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

            if (isCve) {
                const nvd = await this.nvdRepository.findOne({
                    where: {
                        nvd_id: finding.Vulnerability
                    }
                });

                if (nvd) {
                    nvdDescription = nvd.descriptions[0].value;
                }

                const osv = await this.osvRepository.findOne({
                    where: {
                        cve: finding.Vulnerability
                    }
                });

                if (osv) {
                    osvDescription = osv.details;
                    osvSummary = osv.summary;
                }
            }

            if (isGhsa) {
                const osv = await this.osvRepository.findOne({
                    where: {
                        osv_id: finding.Vulnerability
                    }
                });

                if (osv) {
                    osvDescription = osv.details;
                    osvSummary = osv.summary;
                }
            }

            if (osvDescription == '' && nvdDescription != '') finding.Description = nvdDescription;
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
                finding.Description = '#### ' + osvSummary + '.\n\n' + osvDescription;
            }

            // Attach weakness info
            if (finding.Weaknesses) {
                for (const weakness of finding.Weaknesses) {
                    const cwe = await this.cweRepository.findOne({
                        where: {
                            cwe_id: weakness.WeaknessId.replace('CWE-', '')
                        }
                    });

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

        const vulnsOutput: VulnsOutput = await getVulnsResult(analysisId, this.resultRepository);

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
            if (char == '#' && parsingHeader == false) {
                if (text != '') sections.push(text);
                parsingHeader = true;
                text = '';
                continue;
            }

            if (char != '#') parsingHeader = false;

            if (char != '#') text += char;
        }

        if (text != '') {
            sections.push(text);
        }

        const selectedSections = [];

        let index = -1;
        for (const section of sections) {
            index += 1;
            if (index == 0) {
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
            const section = selectedSections[selectedSections.length - 1];
            let trimEndNewLines = true;
            for (let i = section.length - 1; i >= 0; i--) {
                if (section[i] != '\n') {
                    trimEndNewLines = false;
                }
                if (!trimEndNewLines) {
                    newSection += section[i];
                }
            }
            selectedSections[selectedSections.length - 1] = newSection.split('').reverse().join('');
        }

        return selectedSections.join('\n');
    }
}
