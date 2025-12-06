import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { MemberRole } from 'src/base_modules/organizations/memberships/orgMembership.types';
import { Organization } from 'src/base_modules/organizations/organization.entity';
import { MembershipsRepository } from 'src/base_modules/shared/repositories';
import {
    AttackVectorDist,
    CIAImpact,
    LatestVulns,
    ProjectGradeClass,
    ProjectQuickStats,
    QuickStats,
    SeverityInfoByWeek,
    Trend
} from 'src/codeclarity_modules/dashboard/dashboard.types';
import { LicenseDist, Output as SbomOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { Output as VulnsOutput } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import {
    PaginationConfig,
    PaginationUserSuppliedConf,
    TypedPaginatedData
} from 'src/types/pagination.types';
import { SortDirection } from 'src/types/sort.types';
import { Repository } from 'typeorm';

// Native Date API utility functions
function subtractMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
}

function getWeekNumber(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const jan4 = new Date(target.getFullYear(), 0, 4);
    const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
    return 1 + Math.ceil(dayDiff / 7);
}

@Injectable()
export class DashboardService {
    constructor(
        private readonly membershipsRepository: MembershipsRepository,
        @InjectRepository(Organization, 'codeclarity')
        private organizationRepository: Repository<Organization>
    ) {}

    /**
     * Returns the severity info for all projects and their most recent analysis
     * grouped and aggregated by their week number
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to one month back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getWeeklySeverityInfo(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<SeverityInfoByWeek[]> {
        dateRangeStart ??= subtractMonths(new Date(), 1);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .orderBy('analyses.created_on')
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['vuln-finder', 'js-vuln-finder']
            })
            .getOne();

        if (!res) {
            return [];
        }

        const severityInfoByWeek: SeverityInfoByWeek[] = [];

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                const week_number = getWeekNumber(analysis.created_on);
                const year = analysis.created_on.getFullYear();
                let weekInfo = severityInfoByWeek.find(
                    (info) =>
                        info.week_number.week === week_number && info.week_number.year === year
                );

                if (!weekInfo) {
                    weekInfo = {
                        week_number: {
                            week: week_number,
                            year: year
                        },
                        nmb_critical: 0,
                        nmb_high: 0,
                        nmb_medium: 0,
                        nmb_low: 0,
                        nmb_none: 0,
                        summed_severity: 0,
                        projects: []
                    };
                    severityInfoByWeek.push(weekInfo);
                }

                analysis.results.forEach((result) => {
                    const res = result.result as unknown as VulnsOutput;

                    // We only retrieve one result per project per week
                    if (!weekInfo.projects.find((p) => p === project.id.toString())) {
                        for (const workspace_name of Object.keys(res.workspaces)) {
                            const workspace = res.workspaces[workspace_name]!;
                            workspace.Vulnerabilities.forEach((vuln) => {
                                const severity = vuln.Severity.Severity;

                                weekInfo.summed_severity += severity;
                                if (severity >= 7) weekInfo.nmb_critical++;
                                else if (severity >= 4) weekInfo.nmb_high++;
                                else if (severity >= 2) weekInfo.nmb_medium++;
                                else if (severity >= 1) weekInfo.nmb_low++;
                                else weekInfo.nmb_none++;

                                weekInfo.projects.push(project.id.toString());
                            });
                        }
                    }
                });
            });
        }

        return severityInfoByWeek;
    }

    /**
     * Returns the overall (limited by date range) attack vector dist for all projects and their most recent analysis
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getOverallAttackVectorDist(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<AttackVectorDist[]> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['vuln-finder', 'js-vuln-finder']
            })
            .getOne();

        if (!res) {
            return [];
        }

        const attackVectorDist: AttackVectorDist[] = [];

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                analysis.results.forEach((result) => {
                    const res = result.result as unknown as VulnsOutput;

                    for (const workspace_name of Object.keys(res.workspaces)) {
                        const workspace = res.workspaces[workspace_name]!;
                        workspace.Vulnerabilities.forEach((vuln) => {
                            const attack_vector = vuln.Severity.Vector;

                            let attackVector = attackVectorDist.find(
                                (vector) => vector.attack_vector === attack_vector
                            );

                            if (!attackVector) {
                                attackVector = {
                                    attack_vector: attack_vector,
                                    count: 0
                                };
                                attackVectorDist.push(attackVector);
                            }

                            attackVector.count++;
                        });
                    }
                });
            });
        }

        return attackVectorDist;
    }

    /**
     * Returns the overall (limited by date range) cia impact for all projects and their most recent analysis
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getOverallCIAImpact(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<CIAImpact[]> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['vuln-finder', 'js-vuln-finder']
            })
            .getOne();

        if (!res) {
            return [];
        }

        const ciaImpacts: CIAImpact[] = [];

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                analysis.results.forEach((result) => {
                    const res = result.result as unknown as VulnsOutput;

                    for (const workspace_name of Object.keys(res.workspaces)) {
                        const workspace = res.workspaces[workspace_name]!;
                        workspace.Vulnerabilities.forEach((vuln) => {
                            ciaImpacts.push({
                                cia: 'Confidentiality',
                                impact: vuln.Severity.ConfidentialityImpactNumerical
                            });

                            ciaImpacts.push({
                                cia: 'Integrity',
                                impact: vuln.Severity.IntegrityImpactNumerical
                            });

                            ciaImpacts.push({
                                cia: 'Availability',
                                impact: vuln.Severity.AvailabilityImpactNumerical
                            });
                        });
                    }
                });
            });
        }

        return ciaImpacts;
    }

    /**
     * Returns the overall (limited by date range) license dist dist for all projects and their most recent analysis
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getOverallLicenseDist(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<LicenseDist> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['license-finder', 'js-license']
            })
            .getOne();

        if (!res) {
            return {};
        }

        const licenses: LicenseDist = {};

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                analysis.results.forEach((result) => {
                    const res = result.result as unknown as SbomOutput;
                    const licenseDist = res.analysis_info.stats['license_dist'] as Record<
                        string,
                        number
                    >;

                    for (const key of Object.keys(licenseDist)) {
                        if (licenses[key]) {
                            licenses[key] += licenseDist[key]!;
                        } else {
                            licenses[key] = licenseDist[key]!;
                        }
                    }
                });
            });
        }

        return licenses;
    }

    /**
     * Returns the recent vulns for all projects and their most recent analysis
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getRecentVuls(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<LatestVulns> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['vuln-finder', 'js-vuln-finder']
            })
            .getOne();

        if (!res) {
            return {
                vulns: {},
                severity_count: [
                    { severity_class: 'CRITICAL', count: 0 },
                    { severity_class: 'HIGH', count: 0 },
                    { severity_class: 'MEDIUM', count: 0 }
                ]
            };
        }

        const vulns: LatestVulns = {
            vulns: {},
            severity_count: [
                { severity_class: 'CRITICAL', count: 0 },
                { severity_class: 'HIGH', count: 0 },
                { severity_class: 'MEDIUM', count: 0 }
            ]
        };

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                analysis.results.forEach((result) => {
                    const res = result.result as unknown as VulnsOutput;

                    for (const workspace_name of Object.keys(res.workspaces)) {
                        const workspace = res.workspaces[workspace_name]!;
                        workspace.Vulnerabilities.forEach((vuln) => {
                            vulns.vulns[vuln.VulnerabilityId] = {
                                severity: vuln.Severity.Severity,
                                severity_class: 'LOW',
                                cwe: vuln.VulnerabilityId,
                                cwe_name: vuln.VulnerabilityId
                            };
                        });
                    }
                });
            });
        }

        for (const vuln of Object.values(vulns.vulns)) {
            if (vuln.severity >= 7) {
                vuln.severity_class = 'CRITICAL';
                vulns.severity_count[0]!.count++;
            } else if (vuln.severity >= 4) {
                vuln.severity_class = 'HIGH';
                vulns.severity_count[1]!.count++;
            } else if (vuln.severity >= 2) {
                vuln.severity_class = 'MEDIUM';
                vulns.severity_count[2]!.count++;
            }
        }

        return vulns;
    }

    /**
     * Returns quick stats for all projects and their most recent analysis (including: avg severity, nmb of deprecated deps, most affected owasp top 10, most affected cia impact)
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getQuickStats(
        orgId: string,
        user: AuthenticatedUser,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[]
    ): Promise<QuickStats> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        const res = await this.organizationRepository
            .createQueryBuilder('org')
            .where('org.id = :org_id', { org_id: orgId })
            .leftJoinAndSelect('org.projects', 'projects')
            .leftJoinAndSelect('projects.analyses', 'analyses')
            .leftJoinAndSelect('analyses.results', 'results')
            .andWhere('analyses.created_on >= :start_date', { start_date: dateRangeStart })
            .andWhere('results.plugin IN (:...plugin_names)', {
                plugin_names: ['vuln-finder', 'js-vuln-finder']
            })
            .getOne();

        if (!res) {
            return {
                max_grade: {
                    score: 0,
                    class: ProjectGradeClass.D
                },
                max_grade_trend: {
                    trend: Trend.UP,
                    diff: 0
                },
                nmb_deprecated: 0,
                nmb_deprecated_trend: {
                    trend: Trend.UP,
                    diff: 0
                }
            };
        }

        const quickStats: QuickStats = {
            max_grade: {
                score: 0,
                class: ProjectGradeClass.D
            },
            max_grade_trend: {
                trend: Trend.UP,
                diff: 0
            },
            nmb_deprecated: 0,
            nmb_deprecated_trend: {
                trend: Trend.UP,
                diff: 0
            }
        };

        for (const project of res.projects) {
            project.analyses.forEach((analysis) => {
                analysis.results.forEach((result) => {
                    const res = result.result as unknown as VulnsOutput;

                    for (const workspace_name of Object.keys(res.workspaces)) {
                        const workspace = res.workspaces[workspace_name]!;
                        workspace.Vulnerabilities.forEach((_vuln) => {
                            // const _severity = vuln.Severity.Severity;
                            // const _cia = vuln.Severity.ConfidentialityImpact;
                            // const _impact = vuln.Severity.Impact;
                            // const _cwe = vuln.VulnerabilityId;

                            throw new Error('Not implemented');

                            // TODO: implement this feature
                            // if (_cwe === 'DEPRECATED') quickStats.nmb_deprecated++;
                        });
                    }
                });
            });
        }

        return quickStats;
    }

    /**
     * Returns quick stats for all projects and their most recent analysis grouped by project (including: nmb license compliance violations, nmb of vulns, nmb of deprecated deps, nmb of outdated deps)
     * @throws {NotAuthorized} if the user is not authorized to retrieve this information
     *
     * @param orgId The the id of the organization for which the get the stats
     * @param user The authenticated user
     * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
     * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
     * @param integrationIds For which integrations to collect the stats
     */
    async getProjectsQuickStats(
        orgId: string,
        user: AuthenticatedUser,
        pagination: PaginationUserSuppliedConf,
        dateRangeStart?: Date,
        dateRangeEnd?: Date,
        _integrationIds?: string[],
        _sortBy?: string,
        _sortDirection?: SortDirection
    ): Promise<TypedPaginatedData<ProjectQuickStats>> {
        dateRangeStart ??= subtractMonths(new Date(), 2);
        dateRangeEnd ??= new Date();
        await this.membershipsRepository.hasRequiredRole(orgId, user.userId, MemberRole.USER);

        // enum AllowedOrderBy {
        //     PROJECT = 'project_name',
        //     GRADE = 'name',
        //     NMB_VULNS = 'nmb_vulns',
        //     AVG_SEVERITY = 'avg_severity',
        //     SUM_SEVERITY = 'sum_severity',
        //     NMB_DEPRECATED_DEPS = 'nmb_deprecated_deps',
        //     NMB_OUTDATED_DEPS = 'nmb_outdated_deps',
        //     NMB_LICENSE_CONFLICTS = 'nmb_license_conflicts'
        // }

        const paginationConfig: PaginationConfig = {
            maxEntriesPerPage: 100,
            defaultEntriesPerPage: 10
        };

        let entriesPerPage = paginationConfig.defaultEntriesPerPage;
        let currentPage = 0;

        if (pagination.entriesPerPage)
            entriesPerPage = Math.min(
                paginationConfig.maxEntriesPerPage,
                pagination.entriesPerPage
            );

        if (pagination.currentPage) currentPage = Math.max(0, pagination.currentPage);

        // let sortByKey: SortField<ProjectQuickStatsInternal> | undefined = undefined;

        // if (sortBy) {
        //     if (sortBy === AllowedOrderBy.GRADE) sortByKey = 'grade';
        //     else if (sortBy === AllowedOrderBy.PROJECT) sortByKey = 'project.name';
        //     else if (sortBy === AllowedOrderBy.NMB_VULNS) sortByKey = 'nmb_vulnerabilities';
        //     else if (sortBy === AllowedOrderBy.AVG_SEVERITY) sortByKey = 'avg_severity';
        //     else if (sortBy === AllowedOrderBy.SUM_SEVERITY) sortByKey = 'sum_severity';
        //     else if (sortBy === AllowedOrderBy.NMB_DEPRECATED_DEPS) sortByKey = 'nmb_deprecated';
        //     else if (sortBy === AllowedOrderBy.NMB_OUTDATED_DEPS) sortByKey = 'nmb_outdated';
        //     else if (sortBy === AllowedOrderBy.NMB_LICENSE_CONFLICTS)
        //         sortByKey = 'nmb_license_compliance_violations';
        // }

        // const statsPerProject: GetManyResponse<ProjectQuickStatsInternal> =
        //     await this.dashboardRepo.getProjectsQuickStats(
        //         orgId,
        //         dateRangeStart,
        //         dateRangeEnd,
        //         {
        //             limit: entriesPerPage,
        //             offset: currentPage * entriesPerPage,
        //             sortBy: sortByKey ? [sortByKey] : undefined,
        //             sortDirection: sortDirection ? [sortDirection] : undefined
        //         },
        //         integrationIds
        //     );

        const projectQuickStats: ProjectQuickStats[] = [];

        // for (const projectQuickStatData of statsPerProject.entities) {
        //     projectQuickStats.push({
        //         project: projectQuickStatData.project,
        //         nmb_license_compliance_violations:
        //             projectQuickStatData.nmb_license_compliance_violations,
        //         nmb_vulnerabilities: projectQuickStatData.nmb_vulnerabilities,
        //         nmb_outdated: projectQuickStatData.nmb_outdated,
        //         nmb_deprecated: projectQuickStatData.nmb_deprecated,
        //         sum_severity: projectQuickStatData.sum_severity,
        //         avg_severity: projectQuickStatData.avg_severity,
        //         grade: {
        //             score: projectQuickStatData.grade,
        //             class: this.getProjectScoreClassFromScore(projectQuickStatData.grade)
        //         }
        //     });
        // }

        return {
            data: projectQuickStats,
            page: currentPage,
            entry_count: projectQuickStats.length,
            entries_per_page: entriesPerPage,
            total_entries: 0,
            total_pages: 1,
            matching_count: 2,
            filter_count: {}
        };
    }
}
