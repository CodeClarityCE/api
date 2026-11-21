import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { EPSSRepository } from "src/codeclarity_modules/knowledge/epss/epss.repository";
import { severityRank } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";

import type { FixNextEntry } from "./fix-next.types";
import {
  compareFixNextRank,
  fixNextRank,
  type RankedInstance,
} from "./fix-next-rank";
import type { RemediationInstance } from "./remediation.types";
import {
  type ProjectRemediation,
  RemediationTicketLookup,
} from "./remediation-tickets";
import { RemediationsService } from "./remediations.service";

const isCve = (id: string): boolean => /^CVE-/i.test(id);

// The CVE ids of an instance's vulnerability.
const cvesOf = (instance: RemediationInstance): string[] =>
  [instance.vulnerability_id, ...instance.aliases]
    .filter(isCve)
    .map((id) => id.toUpperCase());

/** Ranks the organization's remediations by urgency for the Fix next list. */
@Injectable()
export class FixNextService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    @InjectDataSource("codeclarity") private readonly dataSource: DataSource,
    private readonly remediations: RemediationsService,
    private readonly epssRepository: EPSSRepository,
    private readonly tickets: RemediationTicketLookup,
  ) {}

  /**
   * The most urgent changes across the organization's current analyses.
   * Hidden and policy-excluded instances do not count.
   * @throws {NotAuthorized} if the user is not a member of the organization
   */
  async fixNext(
    orgId: string,
    user: AuthenticatedUser,
    limit: number,
  ): Promise<FixNextEntry[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const projects = await this.remediations.forOrganization(orgId);
    const all: ProjectRemediation[] = projects.flatMap((p) =>
      p.remediations.map((remediation) => ({
        project_id: p.project_id,
        remediation,
      })),
    );
    if (all.length === 0) return [];

    // One entry per kind, package and target version, across projects.
    const groups = new Map<string, ProjectRemediation[]>();
    for (const item of all) {
      const r = item.remediation;
      const key = JSON.stringify([r.kind, r.package, r.target_version]);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const epss = await this.epssRepository.scoresOf(
      all.flatMap((item) => item.remediation.instances.flatMap(cvesOf)),
    );
    const ranked = (instance: RemediationInstance): RankedInstance => {
      const scores = cvesOf(instance)
        .map((cve) => epss.get(cve))
        .filter((score) => score !== undefined);
      return {
        severity_class: instance.severity_class,
        known_exploited: instance.known_exploited,
        epss: scores.length > 0 ? Math.max(...scores) : null,
        prod: instance.prod,
      };
    };

    const entries = [...groups.values()].map((items) => {
      const instances = items.flatMap((item) => item.remediation.instances);
      const first = items[0]!.remediation;
      return {
        items,
        rank: fixNextRank(instances.map(ranked)),
        kind: first.kind,
        package: first.package,
        target_version: first.target_version,
        potentially_breaking: items.some(
          (item) => item.remediation.potentially_breaking,
        ),
        vulnerability_id: worstVulnerability(instances),
        vulnerability_count: new Set(instances.map((i) => i.vulnerability_id))
          .size,
        project_count: new Set(items.map((item) => item.project_id)).size,
        instance_count: instances.length,
      };
    });
    entries.sort(
      (a, b) =>
        compareFixNextRank(a.rank, b.rank) ||
        a.package.localeCompare(b.package) ||
        a.target_version.localeCompare(b.target_version) ||
        a.kind.localeCompare(b.kind),
    );
    const top = entries.slice(0, limit);

    const shown = top.flatMap((entry) => entry.items);
    const [names, tickets] = await Promise.all([
      this.projectNames(shown.map((item) => item.project_id)),
      this.tickets.ticketsOf(orgId, shown),
    ]);
    const ticketOf = new Map(shown.map((item, i) => [item, tickets[i]!]));

    return top.map(({ items, ...entry }) => ({
      ...entry,
      remediations: items
        .map((item) => ({
          project_id: item.project_id,
          project_name: names.get(item.project_id) ?? "",
          workspace: item.remediation.workspace,
          command: item.remediation.command,
          ticket: ticketOf.get(item) ?? null,
        }))
        .sort(
          (a, b) =>
            a.project_name.localeCompare(b.project_name) ||
            a.project_id.localeCompare(b.project_id) ||
            a.workspace.localeCompare(b.workspace),
        ),
    }));
  }

  private async projectNames(ids: string[]): Promise<Map<string, string>> {
    const rows: { id: string; name: string }[] = await this.dataSource.query(
      `SELECT id, name FROM project WHERE id = ANY($1::uuid[])`,
      [[...new Set(ids)]],
    );
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}

// The worst vulnerability among the instances: severity, then score, then id.
function worstVulnerability(instances: RemediationInstance[]): string {
  const rank = (i: RemediationInstance): number =>
    severityRank(i.severity_class);
  const [worst] = [...instances].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      (b.severity_score ?? -1) - (a.severity_score ?? -1) ||
      a.vulnerability_id.localeCompare(b.vulnerability_id),
  );
  return worst!.vulnerability_id;
}
