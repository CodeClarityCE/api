import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import type { SeverityClass } from "src/codeclarity_modules/results/utils/utils";
import { affectedRanges } from "src/codeclarity_modules/vulnerability_instances/affected-ranges";
import type {
  AffectedPackageRanges,
  VersionRange,
} from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";
import {
  type Bind,
  matchingInstancesSql,
  shownSql,
} from "src/codeclarity_modules/vulnerability_instances/organization-vulnerability-filters";
import type { TopLevelDependency } from "src/codeclarity_modules/vulnerability_instances/top-level-paths";

import { toPackageManager } from "./package-manager-commands";
import { type PlannedInstance, planRemediations } from "./plan-remediations";
import type { ProjectRemediations } from "./remediation.types";
import { TopLevelUpgradeSource } from "./top-level-upgrades";

interface InstanceRow {
  id: string;
  project_id: string;
  analysis_id: string;
  vulnerability_id: string;
  analysis_vulnerability_id: string;
  package: string;
  ecosystem: string | null;
  installed_version: string;
  workspace: string;
  prod: boolean;
  severity_class: SeverityClass;
  severity_score: number | null;
  fixed_version: string | null;
  package_manager: string | null;
  top_level_dependencies: TopLevelDependency[];
}

// The ranges one package has in a vulnerability's records; names compare without case, as composer's do.
function rangesOf(
  affected: AffectedPackageRanges[],
  row: InstanceRow,
): VersionRange[] {
  const name = row.package.toLowerCase();
  return affected
    .filter(
      (a) =>
        a.package.toLowerCase() === name &&
        (a.ecosystem === null ||
          row.ecosystem === null ||
          a.ecosystem === row.ecosystem),
    )
    .flatMap((a) => a.ranges);
}

/**
 * Remediations of the projects' current analyses (see "Remediation" in
 * GLOSSARY.md). They are derived on each call from the instance rows, the
 * knowledge sources' ranges and a patcher's top-level upgrades, and are never
 * stored. Callers check the user's access.
 */
@Injectable()
export class RemediationsService {
  constructor(
    @InjectDataSource("codeclarity") private readonly dataSource: DataSource,
    private readonly osvRepository: OSVRepository,
    private readonly topLevelUpgrades: TopLevelUpgradeSource,
  ) {}

  /**
   * The remediations of each project in the organization with instances in
   * its current analysis, ordered by project id. Hidden and policy-excluded
   * instances are left out.
   * @param projectIds only these projects; every project when absent
   */
  async forOrganization(
    orgId: string,
    projectIds?: string[],
  ): Promise<ProjectRemediations[]> {
    if (projectIds?.length === 0) return [];
    const params: unknown[] = [orgId];
    const bind: Bind = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    const filters = projectIds ? { project: projectIds } : {};
    const rows: InstanceRow[] = await this.dataSource.query(
      `SELECT i.id, i."projectId" AS project_id, i."analysisId" AS analysis_id,
              i.vulnerability_id, i.analysis_vulnerability_id, i.package,
              i.ecosystem, i.installed_version, i.workspace, i.prod,
              i.severity_class, i.severity_score, i.fixed_version,
              i.package_manager, i.top_level_dependencies
       FROM (${matchingInstancesSql("$1", filters, bind)}) i
       WHERE ${shownSql({})}
       ORDER BY i."projectId", i.workspace, i.package, i.installed_version,
                i.vulnerability_id`,
      params,
    );

    const affected = await this.affectedOf(rows);
    const projects = new Map<string, InstanceRow[]>();
    for (const row of rows) {
      const list = projects.get(row.project_id) ?? [];
      list.push(row);
      projects.set(row.project_id, list);
    }
    const result: ProjectRemediations[] = [];
    for (const [projectId, list] of projects) {
      const analysisId = list[0]!.analysis_id;
      const upgrades = await this.topLevelUpgrades.upgradesOf(analysisId);
      const instances = list.map((row): PlannedInstance => ({
        instance_id: row.id,
        vulnerability_id: row.vulnerability_id,
        analysis_vulnerability_id: row.analysis_vulnerability_id,
        package: row.package,
        installed_version: row.installed_version,
        workspace: row.workspace,
        prod: row.prod,
        severity_class: row.severity_class,
        severity_score: row.severity_score,
        ecosystem: row.ecosystem,
        package_manager: toPackageManager(row.package_manager),
        fixed_version: row.fixed_version,
        top_level_dependencies: row.top_level_dependencies,
        ranges: rangesOf(affected.get(row.vulnerability_id) ?? [], row),
      }));
      result.push({
        project_id: projectId,
        analysis_id: analysisId,
        ...planRemediations(instances, upgrades),
      });
    }
    return result;
  }

  /** The remediations of one project's current analysis; null when it has no instances. */
  async forProject(
    orgId: string,
    projectId: string,
  ): Promise<ProjectRemediations | null> {
    const [project] = await this.forOrganization(orgId, [projectId]);
    return project ?? null;
  }

  // The affected ranges of every vulnerability the rows name, from its OSV records.
  private async affectedOf(
    rows: InstanceRow[],
  ): Promise<Map<string, AffectedPackageRanges[]>> {
    const affected = new Map<string, AffectedPackageRanges[]>();
    for (const id of new Set(rows.map((row) => row.vulnerability_id))) {
      const records = await this.osvRepository.getVulnsOfVulnerability(id);
      affected.set(id, affectedRanges(records));
    }
    return affected;
  }
}
