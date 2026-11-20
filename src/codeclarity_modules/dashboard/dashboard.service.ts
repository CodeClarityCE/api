import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Analysis } from "src/base_modules/analyses/analysis.entity";
import { SUCCEEDED_ANALYSIS_STATUSES } from "src/base_modules/analyses/analysis-outcome";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { Organization } from "src/base_modules/organizations/organization.entity";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { CIAImpact } from "src/codeclarity_modules/dashboard/dashboard.types";
import { Result } from "src/codeclarity_modules/results/result.entity";
import {
  LicenseDist,
  Output as SbomOutput,
} from "src/codeclarity_modules/results/sbom/sbom.types";
import { shownByDefault } from "src/codeclarity_modules/results/vulnerabilities/utils/instance-status";
import {
  Output as VulnsOutput,
  Vulnerability,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

// Every dashboard endpoint defaults to the same period, so their numbers agree.
const DEFAULT_PERIOD_MONTHS = 2;

const VULN_PLUGINS = ["vuln-finder", "js-vuln-finder"];
const LICENSE_PLUGINS = ["license-finder", "js-license"];

// Native Date API utility functions
function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() - months);
  return result;
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

  /** The findings default views show in the given results, workspace by workspace. */
  private findings(latest: LatestResult[]): Vulnerability[] {
    return latest.flatMap(({ result }) => {
      const output = result.result as unknown as VulnsOutput;
      return Object.values(output.workspaces ?? {}).flatMap((workspace) =>
        shownByDefault(workspace.Vulnerabilities ?? []),
      );
    });
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
}
