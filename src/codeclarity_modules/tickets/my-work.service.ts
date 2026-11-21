import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { MembershipsRepository } from "src/base_modules/shared/repositories";
import { EPSSRepository } from "src/codeclarity_modules/knowledge/epss/epss.repository";
import { isHighEpss } from "src/codeclarity_modules/knowledge/epss/epss-threshold";
import {
  compareFixNextRank,
  type FixNextRank,
  fixNextRank,
} from "src/codeclarity_modules/remediations/fix-next-rank";
import type { RemediationKind } from "src/codeclarity_modules/remediations/remediation.types";
import type { SeverityClass } from "src/codeclarity_modules/results/utils/utils";
import { currentAnalysesSql } from "src/codeclarity_modules/vulnerability_instances/current-analysis";
import { SEVERITY_ORDER } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";
import { shownSql } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerability-filters";

import type { MyWorkEntry } from "./my-work.types";
import { OPEN_TICKET_STATUSES } from "./remediation-tickets.service";
import { type DeadlineState, deadlineState } from "./service-level-targets";
import type { TicketPriority, TicketStatus } from "./ticket.entity";

interface TicketRow {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  due_date: Date | null;
  created_on: Date;
  vulnerability_id: string | null;
  affected_package: string | null;
  severity_class: string | null;
  remediation_kind: RemediationKind | null;
  remediation_workspace: string | null;
  remediation_package: string | null;
  recommended_version: string | null;
  project_id: string;
  project_name: string;
}

interface InstanceRow {
  ticket_id: string;
  vulnerability_id: string;
  aliases: string[];
  severity_class: SeverityClass;
  prod: boolean;
  known_exploited: boolean;
}

const isCve = (id: string): boolean => /^CVE-/i.test(id);

const cvesOf = (ids: string[]): string[] =>
  ids.filter(isCve).map((id) => id.toUpperCase());

const asSeverity = (value: string | null): SeverityClass => {
  const upper = (value ?? "").toUpperCase() as SeverityClass;
  return SEVERITY_ORDER.includes(upper) ? upper : "NONE";
};

// Overdue first, then due soon, then everything else.
const DEADLINE_GROUP: Record<DeadlineState, number> = {
  overdue: 0,
  due_soon: 1,
  on_track: 2,
  none: 2,
};

/** The open tickets assigned to a user, most pressing first. */
@Injectable()
export class MyWorkService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    @InjectDataSource("codeclarity") private readonly dataSource: DataSource,
    private readonly epssRepository: EPSSRepository,
  ) {}

  /**
   * Orders overdue tickets oldest due first, then due soon ones soonest first,
   * then the rest by the Fix next rank of what they still track.
   * @throws {NotAuthorized} if the user is not a member of the organization
   */
  async myWork(
    orgId: string,
    user: AuthenticatedUser,
    limit: number,
  ): Promise<MyWorkEntry[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const tickets: TicketRow[] = await this.dataSource.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.created_on,
         t.vulnerability_id, t.affected_package, t.severity_class,
         t.remediation_kind, t.remediation_workspace, t.remediation_package,
         t.recommended_version, t."projectId" AS project_id, p.name AS project_name
       FROM ticket t JOIN project p ON p.id = t."projectId"
       WHERE t."organizationId" = $1 AND t."assignedToId" = $2
         AND t.status::text = ANY($3::text[])`,
      [orgId, user.userId, OPEN_TICKET_STATUSES],
    );
    if (tickets.length === 0) return [];

    const instances = await this.instancesOf(orgId, tickets);
    const epss = await this.epssRepository.scoresOf(
      cvesOf([
        ...instances.flatMap((i) => [i.vulnerability_id, ...i.aliases]),
        ...tickets.flatMap((t) =>
          t.vulnerability_id ? [t.vulnerability_id] : [],
        ),
      ]),
    );
    const maxEpss = (ids: string[]): number | null => {
      const scores = cvesOf(ids)
        .map((cve) => epss.get(cve))
        .filter((score) => score !== undefined);
      return scores.length > 0 ? Math.max(...scores) : null;
    };

    const byTicket = new Map<string, InstanceRow[]>();
    for (const instance of instances) {
      byTicket.set(instance.ticket_id, [
        ...(byTicket.get(instance.ticket_id) ?? []),
        instance,
      ]);
    }

    const now = new Date();
    const entries = tickets.map((ticket) => {
      const tracked = byTicket.get(ticket.id) ?? [];
      const rank: FixNextRank =
        tracked.length > 0
          ? fixNextRank(
              tracked.map((i) => ({
                severity_class: i.severity_class,
                known_exploited: i.known_exploited,
                epss: maxEpss([i.vulnerability_id, ...i.aliases]),
                prod: i.prod,
              })),
            )
          : // Nothing tracked in the current analysis: rank by the ticket's own severity.
            {
              severity_class: asSeverity(ticket.severity_class),
              known_exploited: false,
              high_epss: isHighEpss(
                maxEpss(
                  ticket.vulnerability_id ? [ticket.vulnerability_id] : [],
                ),
              ),
              prod: false,
              instance_count: 0,
            };
      const due = ticket.due_date ? new Date(ticket.due_date) : null;
      const entry: MyWorkEntry = {
        ticket_id: ticket.id,
        title: ticket.title,
        status: ticket.status,
        priority: ticket.priority,
        project_id: ticket.project_id,
        project_name: ticket.project_name,
        due_date: due ? due.toISOString() : null,
        deadline: deadlineState(due, now),
        remediation: ticket.remediation_kind
          ? {
              kind: ticket.remediation_kind,
              workspace: ticket.remediation_workspace ?? ".",
              package: ticket.remediation_package ?? "",
              target_version: ticket.recommended_version,
            }
          : null,
        vulnerability_id: ticket.remediation_kind
          ? null
          : ticket.vulnerability_id,
        affected_package: ticket.affected_package,
        rank,
      };
      return { entry, due, created: new Date(ticket.created_on) };
    });

    const time = (date: Date | null): number =>
      date ? date.getTime() : Number.POSITIVE_INFINITY;
    entries.sort((a, b) => {
      const group =
        DEADLINE_GROUP[a.entry.deadline] - DEADLINE_GROUP[b.entry.deadline];
      if (group !== 0) return group;
      const byDue = time(a.due) - time(b.due);
      const byRank = compareFixNextRank(a.entry.rank, b.entry.rank);
      const ordered =
        DEADLINE_GROUP[a.entry.deadline] < 2
          ? byDue || byRank
          : byRank || byDue;
      return (
        ordered ||
        a.created.getTime() - b.created.getTime() ||
        a.entry.ticket_id.localeCompare(b.entry.ticket_id)
      );
    });
    return entries.slice(0, limit).map(({ entry }) => entry);
  }

  // The instances each ticket still tracks: its active occurrences, or for an
  // old one-vulnerability ticket without any, its vulnerability in the current analysis.
  private async instancesOf(
    orgId: string,
    tickets: TicketRow[],
  ): Promise<InstanceRow[]> {
    const ids = tickets.map((t) => t.id);
    const occurrences: InstanceRow[] = await this.dataSource.query(
      `SELECT o."ticketId" AS ticket_id, o.vulnerability_id,
         COALESCE(i.aliases, '{}') AS aliases,
         COALESCE(i.severity_class, o.severity_class) AS severity_class,
         COALESCE(i.prod, o.prod) AS prod,
         COALESCE(i.known_exploited, false) AS known_exploited
       FROM ticket_vulnerability_occurrence o
       LEFT JOIN vulnerability_instance i
         ON i."analysisId" = o."analysisId" AND i.workspace = o.workspace
         AND i.vulnerability_id = o.vulnerability_id AND i.package = o.package
         AND i.installed_version = o.installed_version
       WHERE o."ticketId" = ANY($1::uuid[]) AND o.is_active`,
      [ids],
    );

    const covered = new Set(occurrences.map((o) => o.ticket_id));
    const legacy = tickets
      .filter((t) => !t.remediation_kind && t.vulnerability_id)
      .filter((t) => !covered.has(t.id))
      .map((t) => t.id);
    if (legacy.length === 0) return occurrences;

    const current: InstanceRow[] = await this.dataSource.query(
      `SELECT t.id AS ticket_id, i.vulnerability_id, i.aliases, i.severity_class,
         i.prod, i.known_exploited
       FROM ticket t
       JOIN vulnerability_instance i ON i."projectId" = t."projectId"
         AND (i.vulnerability_id = t.vulnerability_id
           OR i.analysis_vulnerability_id = t.vulnerability_id)
       JOIN (${currentAnalysesSql("$2")}) c ON c.id = i."analysisId"
       WHERE t.id = ANY($1::uuid[]) AND ${shownSql({})}`,
      [legacy, orgId],
    );
    return [...occurrences, ...current];
  }
}
