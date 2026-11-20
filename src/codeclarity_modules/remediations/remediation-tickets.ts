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
 * Matches the newest ticket of the project whose vulnerability is one the
 * remediation resolves. Replace it with a match on the remediation target
 * once tickets reference remediations.
 */
@Injectable()
export class VulnerabilityTicketLookup extends RemediationTicketLookup {
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
      vulnerability_id: string;
    }[] = await this.dataSource.query(
      `SELECT t.id, t.status, t."projectId" AS project_id, t.vulnerability_id
       FROM ticket t
       WHERE t."organizationId" = $1
         AND t."projectId" = ANY($2::uuid[])
         AND t.vulnerability_id = ANY($3::varchar[])
       ORDER BY t.created_on DESC, t.id`,
      [
        orgId,
        [...new Set(remediations.map((r) => r.project_id))],
        [...new Set(remediations.flatMap((r) => ids(r.remediation)))],
      ],
    );
    return remediations.map(({ project_id, remediation }) => {
      const wanted = new Set(ids(remediation));
      const ticket = tickets.find(
        (t) => t.project_id === project_id && wanted.has(t.vulnerability_id),
      );
      return ticket ? { id: ticket.id, status: ticket.status } : null;
    });
  }
}
