import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { InstanceDiffLinksService } from "src/codeclarity_modules/vulnerability_instances/instance-diff-links.service";
import { severityRank } from "src/codeclarity_modules/vulnerability_instances/organization-vulnerabilities.types";

import type { Ticket } from "./ticket.entity";
import { ticketBody } from "./ticket-body";
import { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";
import type { TicketInstance, TicketRemediation } from "./tickets.types";

/** What a ticket tracks: its remediation, if any, and the instances it resolves. */
export interface TicketContent {
  /** Null for tickets that track one vulnerability */
  remediation: TicketRemediation | null;
  /** Active first, then worst first */
  instances: TicketInstance[];
}

function ticketInstance(
  o: TicketVulnerabilityOccurrence,
): Omit<TicketInstance, "diff_links"> {
  return {
    id: o.id,
    analysis_id: o.analysis?.id ?? "",
    vulnerability_id: o.vulnerability_id,
    analysis_vulnerability_id: o.analysis_vulnerability_id,
    package: o.package,
    ecosystem: o.ecosystem,
    installed_version: o.installed_version,
    workspace: o.workspace,
    prod: o.prod,
    severity_class: o.severity_class,
    severity_score: o.severity_score,
    fixed_version: o.fixed_version,
    top_level_dependencies: o.top_level_dependencies,
    is_active: o.is_active,
    detected_on: o.detected_on,
    resolved_on: o.resolved_on ?? null,
  };
}

// The remediation a ticket tracks; null for one-vulnerability tickets.
function ticketRemediation(
  ticket: Ticket,
  instances: Omit<TicketInstance, "diff_links">[],
): TicketRemediation | null {
  if (!ticket.remediation_kind) return null;
  // The package is either the vulnerable one or the top-level dependency that installs it.
  const installed = new Set<string>();
  for (const instance of instances.filter((i) => i.is_active)) {
    if (instance.package === ticket.remediation_package) {
      installed.add(instance.installed_version);
    }
    for (const top of instance.top_level_dependencies) {
      if (top.name === ticket.remediation_package) installed.add(top.version);
    }
  }
  return {
    kind: ticket.remediation_kind,
    workspace: ticket.remediation_workspace ?? ".",
    package: ticket.remediation_package ?? "",
    installed_versions: [...installed].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
    target_version: ticket.recommended_version ?? "",
    potentially_breaking: ticket.potentially_breaking ?? false,
    package_manager: ticket.package_manager ?? null,
    command: ticket.remediation_command ?? null,
    manifest_edit: ticket.remediation_manifest_edit ?? null,
  };
}

/** Reads what a ticket tracks, for its page and its external issue body. */
@Injectable()
export class TicketContentService {
  constructor(
    @InjectRepository(TicketVulnerabilityOccurrence, "codeclarity")
    private readonly occurrenceRepository: Repository<TicketVulnerabilityOccurrence>,
    private readonly diffLinks: InstanceDiffLinksService,
  ) {}

  /** The ticket's remediation and instances, each with its diff links. */
  async contentOf(ticket: Ticket): Promise<TicketContent> {
    const occurrences = await this.occurrenceRepository.find({
      where: { ticket: { id: ticket.id } },
      relations: { analysis: true },
    });
    const instances = occurrences
      .map(ticketInstance)
      .sort(
        (a, b) =>
          Number(b.is_active) - Number(a.is_active) ||
          severityRank(b.severity_class) - severityRank(a.severity_class) ||
          (b.severity_score ?? -1) - (a.severity_score ?? -1) ||
          a.vulnerability_id.localeCompare(b.vulnerability_id),
      );
    const links = await this.diffLinks.linksOf(instances);
    return {
      remediation: ticketRemediation(ticket, instances),
      instances: instances.map((instance, i) => ({
        ...instance,
        diff_links: links[i]!,
      })),
    };
  }

  /** The Markdown body of the ticket's external issue. */
  async bodyOf(ticket: Ticket): Promise<string> {
    const { remediation, instances } = await this.contentOf(ticket);
    return ticketBody(ticket, remediation, instances);
  }
}
