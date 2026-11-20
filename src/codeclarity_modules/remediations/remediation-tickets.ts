import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import type { TicketStatus } from "src/codeclarity_modules/tickets/ticket.entity";

import type { Remediation } from "./remediation.types";

/** The ticket that tracks a remediation. */
export interface RemediationTicket {
  id: string;
  status: TicketStatus;
}

/** A remediation with the project it changes. */
export interface ProjectRemediation {
  project_id: string;
  remediation: Remediation;
}

/** Finds the ticket of each remediation; null when it has none. */
export abstract class RemediationTicketLookup {
  abstract ticketsOf(
    orgId: string,
    remediations: ProjectRemediation[],
  ): Promise<(RemediationTicket | null)[]>;
}

/**
 * Matches the ticket created from the remediation (same project, kind,
 * workspace and package), open ones first, then the newest. A remediation
 * without one falls back to the newest one-vulnerability ticket of the
 * project for a vulnerability it resolves (ADR 0016).
 */
@Injectable()
export class TicketRemediationLookup extends RemediationTicketLookup {
  constructor(
    @InjectDataSource("codeclarity") private readonly dataSource: DataSource,
  ) {
    super();
  }

  async ticketsOf(
    orgId: string,
    remediations: ProjectRemediation[],
  ): Promise<(RemediationTicket | null)[]> {
    if (remediations.length === 0) return [];
    const ids = (r: Remediation): string[] =>
      r.instances.flatMap((i) => [
        i.vulnerability_id,
        i.analysis_vulnerability_id,
      ]);
    const tickets: {
      id: string;
      status: TicketStatus;
      project_id: string;
      vulnerability_id: string | null;
      remediation_kind: string | null;
      remediation_workspace: string | null;
      remediation_package: string | null;
    }[] = await this.dataSource.query(
      `SELECT t.id, t.status, t."projectId" AS project_id, t.vulnerability_id,
              t.remediation_kind, t.remediation_workspace, t.remediation_package
       FROM ticket t
       WHERE t."organizationId" = $1
         AND t."projectId" = ANY($2::uuid[])
         AND (t.remediation_package = ANY($3::varchar[])
              OR (t.remediation_kind IS NULL AND t.vulnerability_id = ANY($4::varchar[])))
       ORDER BY t.status IN ('OPEN', 'IN_PROGRESS') DESC, t.created_on DESC, t.id`,
      [
        orgId,
        [...new Set(remediations.map((r) => r.project_id))],
        [...new Set(remediations.map((r) => r.remediation.package))],
        [...new Set(remediations.flatMap((r) => ids(r.remediation)))],
      ],
    );
    return remediations.map(({ project_id, remediation }) => {
      const wanted = new Set(ids(remediation));
      const ofProject = tickets.filter((t) => t.project_id === project_id);
      const ticket =
        ofProject.find(
          (t) =>
            t.remediation_kind === remediation.kind &&
            t.remediation_workspace === remediation.workspace &&
            t.remediation_package === remediation.package,
        ) ??
        ofProject.find(
          (t) =>
            t.remediation_kind === null &&
            t.vulnerability_id !== null &&
            wanted.has(t.vulnerability_id),
        );
      return ticket ? { id: ticket.id, status: ticket.status } : null;
    });
  }
}
