import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Analysis } from "src/base_modules/analyses/analysis.entity";
import { SUCCEEDED_ANALYSIS_STATUSES } from "src/base_modules/analyses/analysis-outcome";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "src/base_modules/organizations/organization.entity";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import {
  AttackVectorDist,
  CIAImpact,
  LatestVulns,
  ProjectGradeClass,
  ProjectQuickStats,
  QuickStats,
  SeverityInfoByWeek,
  Trend,
  WeekNumberGroup,
} from "src/codeclarity_modules/dashboard/dashboard.types";
import { Result } from "src/codeclarity_modules/results/result.entity";
import {
  LicenseDist,
  Output as SbomOutput,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import {
  severityBucket,
  SeverityClass,
} from "src/codeclarity_modules/results/utils/utils";
import {
  Output as VulnsOutput,
  Vulnerability,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import {
  PaginationConfig,
  PaginationUserSuppliedConf,
  TypedPaginatedData,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";

// Every dashboard endpoint defaults to the same period, so their numbers agree.
const DEFAULT_PERIOD_MONTHS = 2;

const VULN_PLUGINS = ["vuln-finder", "js-vuln-finder"];
const LICENSE_PLUGINS = ["license-finder", "js-license"];

const WEEK_COUNT_KEYS = {
  CRITICAL: "nmb_critical",
  HIGH: "nmb_high",
  MEDIUM: "nmb_medium",
  LOW: "nmb_low",
  NONE: "nmb_none",
} as const satisfies Record<SeverityClass, keyof SeverityInfoByWeek>;

// Native Date API utility functions
function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
}

// The ISO 8601 week and week-year a date falls in, in UTC.
function getIsoWeek(date: Date): WeekNumberGroup {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  thursday.setUTCDate(
    thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7),
  );
  const year = thursday.getUTCFullYear();
  const week =
    1 +
    Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * 86400000));
  return { week, year };
}

/** One project's latest completed analysis and the result row it is read from. */
interface LatestResult {
  projectId: string;
  analysis: Analysis;
  result: Result;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    @InjectRepository(Organization, "codeclarity")
    private organizationRepository: Repository<Organization>,
  ) {}

  /**
   * Finds each project's latest completed analysis in the period that has a
   * result from one of the plugins, and its newest row for the first plugin listed.
   */
  private async getLatestResults(
    orgId: string,
    plugins: string[],
    dateRangeStart?: Date,
    dateRangeEnd?: Date,
  ): Promise<LatestResult[]> {
    const query = this.organizationRepository
      .createQueryBuilder("org")
      .where("org.id = :org_id", { org_id: orgId })
      .leftJoinAndSelect("org.projects", "projects")
      .leftJoinAndSelect("projects.analyses", "analyses")
      .leftJoinAndSelect("analyses.results", "results")
      .andWhere("analyses.status IN (:...done)", {
        done: SUCCEEDED_ANALYSIS_STATUSES,
      })
      .andWhere("analyses.created_on >= :start_date", {
        start_date:
          dateRangeStart ?? subtractMonths(new Date(), DEFAULT_PERIOD_MONTHS),
      })
      .andWhere("results.plugin IN (:...plugin_names)", {
        plugin_names: plugins,
      });
    if (dateRangeEnd) {
      query.andWhere("analyses.created_on <= :end_date", {
        end_date: dateRangeEnd,
      });
    }
    const org = await query.getOne();
    if (!org) return [];

    const time = (d: Date | undefined): number =>
      d ? new Date(d).getTime() : 0;
    const latest: LatestResult[] = [];
    for (const project of org.projects) {
      const analysis = [...project.analyses]
        .filter((a) => a.results.length > 0)
        .sort((a, b) => time(b.created_on) - time(a.created_on))[0];
      if (!analysis) continue;
      const plugin = plugins.find((name) =>
        analysis.results.some((r) => r.plugin === name),
      );
      const result = analysis.results
        .filter((r) => r.plugin === plugin)
        .sort((a, b) => time(b.created_on) - time(a.created_on))[0]!;
      latest.push({ projectId: project.id.toString(), analysis, result });
    }
    return latest;
  }

  /** Every vulnerability finding in the given results, workspace by workspace. */
  private findings(latest: LatestResult[]): Vulnerability[] {
    return latest.flatMap(({ result }) => {
      const output = result.result as unknown as VulnsOutput;
      return Object.values(output.workspaces ?? {}).flatMap(
        (workspace) => workspace.Vulnerabilities ?? [],
      );
    });
  }

  /**
   * Returns the severity info of each project's latest completed analysis,
   * grouped by the ISO week the analysis ran in
   * @throws {NotAuthorized} if the user is not authorized to retrieve this information
   *
   * @param orgId The the id of the organization for which the get the stats
   * @param user The authenticated user
   * @param dateRangeStart The start date at which to start collecting stats from analyses (Optional, defaults to two months back)
   * @param dateRangeEnd The end date at which to stop collecting stats from analyses (Optional, defaults to today)
   * @param integrationIds For which integrations to collect the stats
   */
  async getWeeklySeverityInfo(
    orgId: string,
    user: AuthenticatedUser,
    dateRangeStart?: Date,
    dateRangeEnd?: Date,
    _integrationIds?: string[],
  ): Promise<SeverityInfoByWeek[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      VULN_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );
    latest.sort(
      (a, b) =>
        new Date(a.analysis.created_on).getTime() -
        new Date(b.analysis.created_on).getTime(),
    );

    const severityInfoByWeek: SeverityInfoByWeek[] = [];
    for (const entry of latest) {
      const week_number = getIsoWeek(new Date(entry.analysis.created_on));
      let weekInfo = severityInfoByWeek.find(
        (info) =>
          info.week_number.week === week_number.week &&
          info.week_number.year === week_number.year,
      );
      if (!weekInfo) {
        weekInfo = {
          week_number,
          nmb_critical: 0,
          nmb_high: 0,
          nmb_medium: 0,
          nmb_low: 0,
          nmb_none: 0,
          summed_severity: 0,
          projects: [],
        };
        severityInfoByWeek.push(weekInfo);
      }
      weekInfo.projects.push(entry.projectId);

      for (const vuln of this.findings([entry])) {
        const severity = vuln.Severity?.Severity;
        weekInfo.summed_severity += severity ?? 0;
        const key = WEEK_COUNT_KEYS[severityBucket(vuln.Severity)];
        weekInfo[key]++;
      }
    }

    return severityInfoByWeek;
  }

  /**
   * Returns the attack vector dist of each project's latest completed analysis in the date range
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
    _integrationIds?: string[],
  ): Promise<AttackVectorDist[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      VULN_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );

    const attackVectorDist: AttackVectorDist[] = [];
    for (const vuln of this.findings(latest)) {
      const attack_vector = vuln.Severity.Vector;
      let attackVector = attackVectorDist.find(
        (vector) => vector.attack_vector === attack_vector,
      );
      if (!attackVector) {
        attackVector = { attack_vector, count: 0 };
        attackVectorDist.push(attackVector);
      }
      attackVector.count++;
    }

    return attackVectorDist;
  }

  /**
   * Returns the cia impact of each project's latest completed analysis in the date range
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
    _integrationIds?: string[],
  ): Promise<CIAImpact[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      VULN_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );

    return this.findings(latest).flatMap((vuln) => [
      {
        cia: "Confidentiality",
        impact: vuln.Severity.ConfidentialityImpactNumerical,
      },
      { cia: "Integrity", impact: vuln.Severity.IntegrityImpactNumerical },
      {
        cia: "Availability",
        impact: vuln.Severity.AvailabilityImpactNumerical,
      },
    ]);
  }

  /**
   * Returns the license dist of each project's latest completed analysis in the date range
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
    _integrationIds?: string[],
  ): Promise<LicenseDist> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      LICENSE_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );

    const licenses: LicenseDist = {};
    for (const { result } of latest) {
      const output = result.result as unknown as SbomOutput;
      const licenseDist = (output.analysis_info?.stats?.["license_dist"] ??
        {}) as Record<string, number>;
      for (const [key, count] of Object.entries(licenseDist)) {
        licenses[key] = (licenses[key] ?? 0) + count;
      }
    }

    return licenses;
  }

  /**
   * Returns the vulns of each project's latest completed analysis in the date range,
   * with the number of findings per severity class
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
    _integrationIds?: string[],
  ): Promise<LatestVulns> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      VULN_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );

    const vulns: LatestVulns = {
      vulns: {},
      severity_count: [
        { severity_class: "CRITICAL", count: 0 },
        { severity_class: "HIGH", count: 0 },
        { severity_class: "MEDIUM", count: 0 },
        { severity_class: "LOW", count: 0 },
        { severity_class: "NONE", count: 0 },
      ],
    };

    // Counts findings, like the weekly exposure and the results pages do.
    for (const vuln of this.findings(latest)) {
      const severity_class = severityBucket(vuln.Severity);
      vulns.vulns[vuln.VulnerabilityId] = {
        severity: vuln.Severity?.Severity ?? 0,
        severity_class,
        cwe: vuln.VulnerabilityId,
        cwe_name: vuln.VulnerabilityId,
      };
      const count = vulns.severity_count.find(
        (c) => c.severity_class === severity_class,
      );
      if (count) count.count++;
    }

    return vulns;
  }

  /**
   * Returns quick stats of each project's latest completed analysis in the date range (including: avg severity, nmb of deprecated deps, most affected owasp top 10, most affected cia impact)
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
    _integrationIds?: string[],
  ): Promise<QuickStats> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const latest = await this.getLatestResults(
      orgId,
      VULN_PLUGINS,
      dateRangeStart,
      dateRangeEnd,
    );

    if (latest.length === 0) {
      return {
        max_grade: {
          score: 10,
          class: ProjectGradeClass.A_PLUS,
        },
        max_grade_trend: {
          trend: Trend.EQUAL,
          diff: 0,
        },
        nmb_deprecated: 0,
        nmb_deprecated_trend: {
          trend: Trend.EQUAL,
          diff: 0,
        },
        nmb_projects: 0,
      };
    }

    const findings = this.findings(latest);
    const totalVulnSeverity = findings.reduce(
      (sum, vuln) => sum + (vuln.Severity?.Severity ?? 0),
      0,
    );
    const totalVulnCount = findings.length;

    // Calculate security score: 100 = best (no vulnerabilities), 0 = worst
    // Average severity is 0-10 (CVSS scale), convert to 0-100% scale
    const avgSeverity =
      totalVulnCount > 0 ? totalVulnSeverity / totalVulnCount : 0;
    const securityScorePercent = Math.max(
      0,
      Math.min(100, (10 - avgSeverity) * 10),
    );

    // Map percentage score to grade class
    // These thresholds match frontend/src/utils/gradeUtils.ts
    const gradeClass = this.scoreToGradeClass(securityScorePercent);

    const quickStats: QuickStats = {
      max_grade: {
        score: Math.round(securityScorePercent) / 10, // Return as 0-10 scale for backwards compatibility
        class: gradeClass,
      },
      max_grade_trend: {
        trend: Trend.EQUAL,
        diff: 0,
      },
      nmb_deprecated: 0,
      nmb_deprecated_trend: {
        trend: Trend.EQUAL,
        diff: 0,
      },
      nmb_projects: latest.length,
    };

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
    _dateRangeStart?: Date,
    _dateRangeEnd?: Date,
    _integrationIds?: string[],
    _sortBy?: string,
    _sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<ProjectQuickStats>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

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
      defaultEntriesPerPage: 10,
    };

    let entriesPerPage = paginationConfig.defaultEntriesPerPage;
    let currentPage = 0;

    if (pagination.entriesPerPage)
      entriesPerPage = Math.min(
        paginationConfig.maxEntriesPerPage,
        pagination.entriesPerPage,
      );

    if (pagination.currentPage)
      currentPage = Math.max(0, pagination.currentPage);

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
      filter_count: {},
    };
  }

  /**
   * Convert a percentage score (0-100) to a ProjectGradeClass
   * These thresholds match frontend/src/utils/gradeUtils.ts
   */
  private scoreToGradeClass(scorePercent: number): ProjectGradeClass {
    if (scorePercent >= 95) return ProjectGradeClass.A_PLUS;
    if (scorePercent >= 90) return ProjectGradeClass.A;
    if (scorePercent >= 85) return ProjectGradeClass.B_PLUS;
    if (scorePercent >= 75) return ProjectGradeClass.B;
    if (scorePercent >= 65) return ProjectGradeClass.C_PLUS;
    if (scorePercent >= 55) return ProjectGradeClass.C;
    if (scorePercent >= 45) return ProjectGradeClass.D_PLUS;
    return ProjectGradeClass.D;
  }
}
