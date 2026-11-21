import { Injectable, OnModuleInit } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import type { Remediation } from "src/codeclarity_modules/remediations/remediation.types";
import { RemediationsService } from "src/codeclarity_modules/remediations/remediations.service";
import { currentAnalysesSql } from "src/codeclarity_modules/vulnerability_instances/current-analysis";
import { severityRank } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";
import { shownSql } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerability-filters";
import type { TopLevelDependency } from "src/codeclarity_modules/vulnerability_instances/top-level-paths";
import {
  type StoredAnalysis,
  VulnerabilityInstanceWriter,
} from "src/codeclarity_modules/vulnerability_instances/vulnerability-instance-writer.service";
import { CodeClarityLogger } from "src/services/logger.service";

import { OPEN_TICKET_STATUSES } from "../remediation-tickets.service";
import { Ticket, TicketStatus } from "../ticket.entity";
import {
  TicketEvent,
  type TicketEventData,
  TicketEventType,
} from "../ticket-event.entity";
import { TicketVulnerabilityOccurrence } from "../ticket-occurrence.entity";

// An open ticket of the project, with what it tracks.
interface OpenTicket {
  id: string;
  status: TicketStatus;
  vulnerability_id: string | null;
  remediation_kind: Remediation["kind"] | null;
  remediation_workspace: string | null;
  remediation_package: string | null;
  // False when the analysis is older than what the ticket was created from.
  follows: boolean;
}

// One shown instance of the current analysis.
interface CurrentInstance {
  id: string;
  vulnerability_id: string;
  analysis_vulnerability_id: string;
  aliases: string[];
  package: string;
  ecosystem: string | null;
  installed_version: string;
  workspace: string;
  prod: boolean;
  severity_class: string;
  severity_score: number | null;
  fixed_version: string | null;
  top_level_dependencies: TopLevelDependency[];
}

// The key an instance keeps from one analysis to the next.
const keyOf = (i: {
  workspace: string;
  vulnerability_id: string;
  package: string;
  installed_version: string;
}): string =>
  [i.workspace, i.vulnerability_id, i.package, i.installed_version].join(
    "\u0000",
  );

// The occurrence fields that follow the instance row of the current analysis.
const snapshotOf = (
  analysisId: string,
  i: CurrentInstance,
): QueryDeepPartialEntity<TicketVulnerabilityOccurrence> => ({
  analysis: { id: analysisId },
  analysis_vulnerability_id: i.analysis_vulnerability_id,
  ecosystem: i.ecosystem,
  prod: i.prod,
  severity_class: i.severity_class,
  severity_score: i.severity_score,
  fixed_version: i.fixed_version,
  top_level_dependencies: i.top_level_dependencies,
});

/** Keeps open tickets' instances in step with the current analysis (ADR 0016) and auto-resolves emptied ones when enabled. */
@Injectable()
export class TicketInstanceSync implements OnModuleInit {
  private readonly logger = CodeClarityLogger.forService("TicketInstanceSync");

  constructor(
    private readonly writer: VulnerabilityInstanceWriter,
    private readonly remediations: RemediationsService,
  ) {}

  onModuleInit(): void {
    this.writer.onInstancesStored((analysis, manager) =>
      this.sync(analysis, manager),
    );
  }

  /** Updates the open tickets of the analysis's project when it is now their current analysis. */
  async sync(analysis: StoredAnalysis, manager: EntityManager): Promise<void> {
    // An analysis without results says nothing about which instances are gone.
    if (!analysis.hasResults) return;
    const { analysisId, projectId, organizationId } = analysis;
    const [current]: { id: string }[] = await manager.query(
      `SELECT c.id FROM (${currentAnalysesSql("$1")}) c WHERE c."projectId" = $2`,
      [organizationId, projectId],
    );
    if (current?.id !== analysisId) return;

    const tickets: OpenTicket[] = await manager.query(
      `SELECT t.id, t.status, t.vulnerability_id, t.remediation_kind,
              t.remediation_workspace, t.remediation_package,
              a.created_on >= COALESCE(s.created_on, t.created_on) AS follows
       FROM ticket t
       JOIN analysis a ON a.id = $2
       LEFT JOIN analysis s ON s.id = t."sourceAnalysisId"
       WHERE t."projectId" = $1 AND t.status = ANY($3)`,
      [projectId, analysisId, OPEN_TICKET_STATUSES],
    );
    const following = tickets.filter((t) => t.follows);
    if (following.length === 0) return;

    const instances: CurrentInstance[] = await manager.query(
      `SELECT i.id, i.vulnerability_id, i.analysis_vulnerability_id, i.aliases,
              i.package, i.ecosystem, i.installed_version, i.workspace, i.prod,
              i.severity_class, i.severity_score, i.fixed_version,
              i.top_level_dependencies
       FROM vulnerability_instance i
       WHERE i."analysisId" = $1 AND ${shownSql({})}`,
      [analysisId],
    );
    const planned = following.some((t) => t.remediation_kind)
      ? await this.remediations.forProject(organizationId, projectId, manager)
      : null;
    const [org]: { auto_resolve_tickets: boolean }[] = await manager.query(
      `SELECT auto_resolve_tickets FROM organization WHERE id = $1`,
      [organizationId],
    );

    let resolved = 0;
    for (const ticket of following) {
      const remediation = ticket.remediation_kind
        ? (planned?.remediations.find(
            (r) =>
              r.kind === ticket.remediation_kind &&
              r.workspace === ticket.remediation_workspace &&
              r.package === ticket.remediation_package,
          ) ?? null)
        : null;
      const tracked = remediation
        ? new Set(remediation.instances.map((i) => i.instance_id))
        : null;
      const resolves = (i: CurrentInstance): boolean =>
        tracked
          ? tracked.has(i.id)
          : ticket.remediation_kind === null &&
            ticket.vulnerability_id !== null &&
            [i.vulnerability_id, i.analysis_vulnerability_id, ...i.aliases]
              .map((id) => id.toUpperCase())
              .includes(ticket.vulnerability_id.toUpperCase());
      const active = await this.syncTicket(
        manager,
        ticket,
        analysisId,
        instances,
        resolves,
        remediation,
      );
      if (active === 0 && org?.auto_resolve_tickets) {
        await this.resolve(manager, ticket, analysisId);
        resolved++;
      }
    }
    if (resolved > 0) {
      this.logger.log("Auto-resolved tickets", {
        analysisId,
        projectId,
        organizationId,
        resolved,
      });
    }
  }

  // Follows the current instances and returns how many are still active.
  private async syncTicket(
    manager: EntityManager,
    ticket: OpenTicket,
    analysisId: string,
    instances: CurrentInstance[],
    resolves: (i: CurrentInstance) => boolean,
    remediation: Remediation | null,
  ): Promise<number> {
    const occurrences = manager.getRepository(TicketVulnerabilityOccurrence);
    const existing = await occurrences.find({
      where: { ticket: { id: ticket.id } },
      order: { detected_on: "DESC" },
    });
    const present = new Map(instances.map((i) => [keyOf(i), i]));
    const now = new Date();
    const events: TicketEventData[] = [];
    const active: CurrentInstance[] = [];

    // One occurrence per key: the active one, else the latest resolved.
    const byKey = new Map<string, TicketVulnerabilityOccurrence>();
    for (const o of existing) {
      const kept = byKey.get(keyOf(o));
      if (!kept || (o.is_active && !kept.is_active)) byKey.set(keyOf(o), o);
    }

    for (const [key, o] of byKey) {
      const instance = present.get(key);
      if (o.is_active && instance) {
        await occurrences.update(o.id, snapshotOf(analysisId, instance));
        active.push(instance);
      } else if (o.is_active) {
        await occurrences.update(o.id, { is_active: false, resolved_on: now });
        events.push({
          vulnerability_id: o.vulnerability_id,
          analysis_id: analysisId,
          source: "automation",
        });
      }
    }
    const added: TicketEventData[] = [];
    for (const instance of instances) {
      const key = keyOf(instance);
      const o = byKey.get(key);
      if (o?.is_active || !resolves(instance)) continue;
      if (o) {
        await occurrences.update(o.id, {
          ...snapshotOf(analysisId, instance),
          is_active: true,
          resolved_on: () => "NULL",
        });
      } else {
        await occurrences.insert({
          ...snapshotOf(analysisId, instance),
          ticket: { id: ticket.id },
          workspace: instance.workspace,
          vulnerability_id: instance.vulnerability_id,
          package: instance.package,
          installed_version: instance.installed_version,
          detected_on: now,
          is_active: true,
        });
      }
      active.push(instance);
      added.push({
        vulnerability_id: instance.vulnerability_id,
        analysis_id: analysisId,
        source: "automation",
      });
    }

    await this.saveEvents(
      manager,
      ticket.id,
      TicketEventType.OCCURRENCE_RESOLVED,
      events,
      now,
    );
    await this.saveEvents(
      manager,
      ticket.id,
      TicketEventType.OCCURRENCE_ADDED,
      added,
      now,
    );
    await this.updateTicket(manager, ticket, active, remediation, now);
    return active.length;
  }

  // The remediation's current target and command, and the worst active severity; title and assignee stay.
  private async updateTicket(
    manager: EntityManager,
    ticket: OpenTicket,
    active: CurrentInstance[],
    remediation: Remediation | null,
    now: Date,
  ): Promise<void> {
    const worst = [...active].sort(
      (a, b) =>
        severityRank(b.severity_class) - severityRank(a.severity_class) ||
        (b.severity_score ?? -1) - (a.severity_score ?? -1),
    )[0];
    const changes: QueryDeepPartialEntity<Ticket> = {};
    if (remediation) {
      Object.assign(changes, {
        recommended_version: remediation.target_version,
        potentially_breaking: remediation.potentially_breaking,
        package_manager: remediation.package_manager,
        remediation_command: remediation.command,
        remediation_manifest_edit: remediation.manifest_edit,
      });
    }
    if (worst && ticket.remediation_kind) {
      changes.severity_class = worst.severity_class;
      if (worst.severity_score !== null) {
        changes.severity_score = worst.severity_score;
      }
    }
    if (Object.keys(changes).length === 0) return;
    await manager
      .getRepository(Ticket)
      .update(ticket.id, { ...changes, updated_on: now });
  }

  private async resolve(
    manager: EntityManager,
    ticket: OpenTicket,
    analysisId: string,
  ): Promise<void> {
    const now = new Date();
    await manager.getRepository(Ticket).update(ticket.id, {
      status: TicketStatus.RESOLVED,
      resolved_on: now,
      updated_on: now,
    });
    await this.saveEvents(
      manager,
      ticket.id,
      TicketEventType.RESOLVED,
      [{ source: "automation", analysis_id: analysisId }],
      now,
    );
    await this.saveEvents(
      manager,
      ticket.id,
      TicketEventType.STATUS_CHANGED,
      [
        {
          old_status: ticket.status,
          new_status: TicketStatus.RESOLVED,
          source: "automation",
          analysis_id: analysisId,
        },
      ],
      now,
    );
  }

  private async saveEvents(
    manager: EntityManager,
    ticketId: string,
    type: TicketEventType,
    data: TicketEventData[],
    now: Date,
  ): Promise<void> {
    if (data.length === 0) return;
    await manager.getRepository(TicketEvent).insert(
      data.map((event_data) => ({
        ticket: { id: ticketId },
        event_type: type,
        event_data,
        created_on: now,
      })),
    );
  }
}
