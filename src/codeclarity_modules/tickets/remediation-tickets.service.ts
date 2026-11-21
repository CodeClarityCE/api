import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  ProjectsRepository,
  UsersRepository,
} from "src/base_modules/shared/repositories";
import {
  type Remediation,
  RemediationKind,
} from "src/codeclarity_modules/remediations/remediation.types";
import { RemediationsService } from "src/codeclarity_modules/remediations/remediations.service";
import type { TopLevelDependency } from "src/codeclarity_modules/vulnerability_instances/top-level-paths";
import { EntityNotFound } from "src/types/error.types";

import { dueDateFor, targetsOf } from "./service-level-targets";
import {
  Ticket,
  TicketPriority,
  TicketStatus,
  TicketType,
} from "./ticket.entity";
import { TicketEvent, TicketEventType } from "./ticket-event.entity";
import { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";
import type {
  CreateRemediationTicketBody,
  CreateRemediationTicketResult,
  DuplicateTicket,
} from "./tickets.types";

/** Ticket statuses that still need work. */
export const OPEN_TICKET_STATUSES = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
];

/** What identifies a remediation within a project; its target version can change. */
export interface RemediationIdentity {
  kind: RemediationKind;
  workspace: string;
  package: string;
}

// The instance row fields a remediation instance does not carry.
interface InstanceExtras {
  id: string;
  analysis_id: string;
  ecosystem: string | null;
  fixed_version: string | null;
  top_level_dependencies: TopLevelDependency[];
}

const VERB: Record<RemediationKind, string> = {
  [RemediationKind.UpgradeDirect]: "Upgrade",
  [RemediationKind.UpgradeTopLevel]: "Upgrade",
  [RemediationKind.ForceVersion]: "Force",
};

const PRIORITY_OF_CLASS: Record<string, TicketPriority> = {
  CRITICAL: TicketPriority.CRITICAL,
  HIGH: TicketPriority.HIGH,
  MEDIUM: TicketPriority.MEDIUM,
};

/** The ticket title naming a remediation, such as "Upgrade lodash to 4.17.21". */
export function remediationTitle(remediation: Remediation): string {
  const where =
    remediation.workspace === "." ? "" : ` in ${remediation.workspace}`;
  return `${VERB[remediation.kind]} ${remediation.package} to ${remediation.target_version}${where}`.slice(
    0,
    200,
  );
}

/** A top-level path written as "express@4.17.0 > qs@6.5.0". */
export function pathText(dependency: TopLevelDependency): string {
  return dependency.path.map((p) => `${p.name}@${p.version}`).join(" > ");
}

// The ticket description: every resolved vulnerability with its versions and paths, then the command.
function describe(
  remediation: Remediation,
  extras: Map<string, InstanceExtras>,
): string {
  const lines = [
    `${remediationTitle(remediation)} (installed: ${remediation.installed_versions.join(", ")}).`,
  ];
  if (remediation.potentially_breaking) {
    lines.push(
      "",
      "This is potentially breaking: it leaves the current major.",
    );
  }
  lines.push("", "Resolves:");
  for (const instance of remediation.instances) {
    const extra = extras.get(instance.instance_id);
    const score =
      instance.severity_score === null
        ? ""
        : ` ${instance.severity_score.toFixed(1)}`;
    const fixed = extra?.fixed_version
      ? `, fixed in ${extra.fixed_version}`
      : "";
    lines.push(
      `- ${instance.vulnerability_id} (${instance.severity_class}${score}): ${instance.package} ${instance.installed_version}${fixed}`,
    );
    for (const dependency of extra?.top_level_dependencies ?? []) {
      lines.push(`  - via ${pathText(dependency)}`);
    }
  }
  if (remediation.manifest_edit) {
    lines.push(
      "",
      `Add to ${remediation.manifest_edit.file}:`,
      "",
      "```",
      remediation.manifest_edit.text.trimEnd(),
      "```",
    );
  }
  if (remediation.command) {
    lines.push("", "Run:", "", "```", remediation.command, "```");
  }
  return lines.join("\n");
}

/**
 * Creates tickets from the remediations of a project's current analysis
 * (ADR 0016) and finds the open ticket that already tracks one.
 */
@Injectable()
export class RemediationTicketsService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly remediations: RemediationsService,
    @InjectRepository(Ticket, "codeclarity")
    private readonly ticketRepository: Repository<Ticket>,
  ) {}

  /** The open ticket of the project that tracks this remediation, if any. */
  async openTicketOf(
    projectId: string,
    remediation: RemediationIdentity,
  ): Promise<DuplicateTicket | null> {
    const existing = await this.ticketRepository.findOne({
      where: {
        project: { id: projectId },
        remediation_kind: remediation.kind,
        remediation_workspace: remediation.workspace,
        remediation_package: remediation.package,
        status: In(OPEN_TICKET_STATUSES),
      },
      order: { created_on: "ASC" },
    });
    return existing
      ? {
          ticket_id: existing.id,
          title: existing.title,
          status: existing.status,
        }
      : null;
  }

  /**
   * Creates a ticket from one remediation of the project's current analysis,
   * prefilled with its instances, paths and command. When an open ticket
   * already tracks it, returns that one instead unless `allow_duplicate`.
   */
  async create(
    orgId: string,
    projectId: string,
    body: CreateRemediationTicketBody,
    user: AuthenticatedUser,
  ): Promise<CreateRemediationTicketResult> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );
    const project = await this.projectsRepository.getProjectByIdAndOrganization(
      projectId,
      orgId,
    );
    const organization =
      await this.organizationsRepository.getOrganizationById(orgId);
    const creator = await this.usersRepository.getUserById(user.userId);
    if (!organization || !creator) throw new EntityNotFound();

    const planned = await this.remediations.forProject(orgId, projectId);
    const remediation = planned?.remediations.find(
      (r) =>
        r.kind === body.kind &&
        r.workspace === body.workspace &&
        r.package === body.package,
    );
    if (!planned || !remediation) throw new EntityNotFound();

    if (!body.allow_duplicate) {
      const duplicate = await this.openTicketOf(projectId, remediation);
      if (duplicate) return { created: false, ticket_id: null, duplicate };
    }

    const extras = await this.extrasOf(remediation);
    const worst = remediation.instances[0]!;
    const now = new Date();

    const ticketId = await this.ticketRepository.manager.transaction(
      async (manager) => {
        const ticket = await manager.getRepository(Ticket).save({
          title: remediationTitle(remediation),
          description: describe(remediation, extras),
          status: TicketStatus.OPEN,
          priority:
            body.priority ??
            PRIORITY_OF_CLASS[worst.severity_class] ??
            TicketPriority.LOW,
          type: TicketType.VULNERABILITY,
          affected_package: remediation.package,
          severity_class: worst.severity_class,
          ...(worst.severity_score === null
            ? {}
            : { severity_score: worst.severity_score }),
          recommended_version: remediation.target_version,
          remediation_kind: remediation.kind,
          remediation_workspace: remediation.workspace,
          remediation_package: remediation.package,
          potentially_breaking: remediation.potentially_breaking,
          package_manager: remediation.package_manager,
          remediation_command: remediation.command,
          remediation_manifest_edit: remediation.manifest_edit,
          due_date: dueDateFor(
            body.due_date,
            targetsOf(organization),
            worst.severity_class,
            now,
          ),
          created_on: now,
          project,
          organization,
          created_by: creator,
          source_analysis: { id: planned.analysis_id },
        } as Partial<Ticket>);

        await manager.getRepository(TicketVulnerabilityOccurrence).save(
          remediation.instances.map((instance) => {
            const extra = extras.get(instance.instance_id);
            return {
              ticket,
              analysis: { id: extra?.analysis_id ?? planned.analysis_id },
              workspace: instance.workspace,
              vulnerability_id: instance.vulnerability_id,
              analysis_vulnerability_id: instance.analysis_vulnerability_id,
              package: instance.package,
              ecosystem: extra?.ecosystem ?? null,
              installed_version: instance.installed_version,
              prod: instance.prod,
              severity_class: instance.severity_class,
              severity_score: instance.severity_score,
              fixed_version: extra?.fixed_version ?? null,
              top_level_dependencies: extra?.top_level_dependencies ?? [],
              detected_on: now,
              is_active: true,
            } as Partial<TicketVulnerabilityOccurrence>;
          }),
        );

        await manager.getRepository(TicketEvent).save({
          ticket,
          event_type: TicketEventType.CREATED,
          event_data: {
            source: "manual",
            remediation: {
              kind: remediation.kind,
              workspace: remediation.workspace,
              package: remediation.package,
              target_version: remediation.target_version,
            },
          },
          performed_by: creator,
          created_on: now,
        });
        return ticket.id;
      },
    );
    return { created: true, ticket_id: ticketId, duplicate: null };
  }

  // Paths, fixed versions and ecosystems of the remediation's instance rows.
  private async extrasOf(
    remediation: Remediation,
  ): Promise<Map<string, InstanceExtras>> {
    const rows: InstanceExtras[] = await this.ticketRepository.manager.query(
      `SELECT id, "analysisId" AS analysis_id, ecosystem, fixed_version, top_level_dependencies
       FROM vulnerability_instance WHERE id = ANY($1)`,
      [remediation.instances.map((i) => i.instance_id)],
    );
    return new Map(rows.map((row) => [row.id, row]));
  }
}
