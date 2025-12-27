import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { AuthenticatedUser } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import {
  MembershipsRepository,
  OrganizationsRepository,
  UsersRepository,
  ProjectsRepository,
} from "src/base_modules/shared/repositories";
import type {
  CVSS2,
  CVSS31,
} from "src/codeclarity_modules/knowledge/cvss.types";
import { EPSSRepository } from "src/codeclarity_modules/knowledge/epss/epss.repository";
import { NVD } from "src/codeclarity_modules/knowledge/nvd/nvd.entity";
import { NVDRepository } from "src/codeclarity_modules/knowledge/nvd/nvd.repository";
import { OSV } from "src/codeclarity_modules/knowledge/osv/osv.entity";
import { OSVRepository } from "src/codeclarity_modules/knowledge/osv/osv.repository";
import {
  VulnerabilityDetailsReport,
  SeverityInfo,
  ReferenceInfo,
  VulnSourceInfo,
} from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";
import { VulnerabilityService } from "src/codeclarity_modules/results/vulnerabilities/vulnerability.service";
import { EntityNotFound } from "src/types/error.types";
import {
  PaginationConfig,
  TypedPaginatedData,
  PaginationUserSuppliedConf,
} from "src/types/pagination.types";
import { SortDirection } from "src/types/sort.types";
import { Repository, In } from "typeorm";
import { TicketIntegrationService } from "./integrations/ticket-integration.service";
import { TicketEvent, TicketEventType } from "./ticket-event.entity";
import { TicketVulnerabilityOccurrence } from "./ticket-occurrence.entity";
import { Ticket, TicketStatus } from "./ticket.entity";
import {
  CreateTicketBody,
  UpdateTicketBody,
  BulkUpdateTicketsBody,
  TicketSummary,
  TicketDetails,
  TicketDashboardStats,
  BulkUpdateResult,
  DuplicateCheckResult,
  TicketFilters,
  TicketSortField,
} from "./tickets.types";

// Interfaces for raw query results to avoid `any` type issues
interface RawTicketWithExternalLinkCount {
  external_link_count: string;
}

interface RawPriorityCount {
  priority: string;
  count: string;
}

interface RawProjectCount {
  project_id: string;
  project_name: string;
  open_count: string;
}

interface RawAverageResolutionTime {
  avg_days: string | null;
}

// Helper to get full name from user-like objects
function getUserFullName(
  user: { first_name: string; last_name: string } | undefined | null,
): string | undefined {
  if (!user) return undefined;
  return `${user.first_name} ${user.last_name}`;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly membershipsRepository: MembershipsRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly projectsRepository: ProjectsRepository,
    private readonly vulnerabilityService: VulnerabilityService,
    private readonly ticketIntegrationService: TicketIntegrationService,
    private readonly nvdRepository: NVDRepository,
    private readonly osvRepository: OSVRepository,
    private readonly epssRepository: EPSSRepository,
    @InjectRepository(Ticket, "codeclarity")
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketEvent, "codeclarity")
    private ticketEventRepository: Repository<TicketEvent>,
    @InjectRepository(TicketVulnerabilityOccurrence, "codeclarity")
    private ticketOccurrenceRepository: Repository<TicketVulnerabilityOccurrence>,
  ) {}

  /**
   * Create a new ticket
   */
  async create(
    orgId: string,
    createBody: CreateTicketBody,
    user: AuthenticatedUser,
  ): Promise<string> {
    // Check user has at least USER role
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const organization =
      await this.organizationsRepository.getOrganizationById(orgId);
    if (!organization) {
      throw new EntityNotFound();
    }

    const creator = await this.usersRepository.getUserById(user.userId);
    if (!creator) {
      throw new EntityNotFound();
    }

    const project = await this.projectsRepository.getProjectById(
      createBody.project_id,
    );
    if (!project) {
      throw new EntityNotFound();
    }

    // Check for duplicate if vulnerability_id is provided
    if (createBody.vulnerability_id) {
      const existing = await this.ticketRepository.findOne({
        where: {
          organization: { id: orgId },
          project: { id: createBody.project_id },
          vulnerability_id: createBody.vulnerability_id,
        },
      });

      if (existing) {
        // Return existing ticket ID instead of creating duplicate
        return existing.id;
      }
    }

    const now = new Date();

    const ticket = await this.ticketRepository.save({
      title: createBody.title,
      description: createBody.description,
      status: TicketStatus.OPEN,
      priority: createBody.priority,
      type: createBody.type,
      vulnerability_id: createBody.vulnerability_id,
      affected_package: createBody.affected_package,
      affected_version: createBody.affected_version,
      severity_score: createBody.severity_score,
      severity_class: createBody.severity_class,
      recommended_version: createBody.recommended_version,
      remediation_notes: createBody.remediation_notes,
      due_date: createBody.due_date ? new Date(createBody.due_date) : undefined,
      created_on: now,
      project,
      organization,
      created_by: creator,
    } as Partial<Ticket>);

    // Create initial event
    await this.ticketEventRepository.save({
      ticket,
      event_type: TicketEventType.CREATED,
      event_data: {
        source: "manual",
        vulnerability_id: createBody.vulnerability_id,
      },
      performed_by: creator,
      created_on: now,
    });

    return ticket.id;
  }

  /**
   * Get a single ticket by ID
   */
  async get(
    orgId: string,
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<TicketDetails> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const ticket = await this.ticketRepository.findOne({
      where: {
        id: ticketId,
        organization: { id: orgId },
      },
      relations: [
        "project",
        "created_by",
        "assigned_to",
        "external_links",
        "source_analysis",
      ],
    });

    if (!ticket) {
      throw new EntityNotFound();
    }

    // Get occurrence counts
    const [occurrenceCount, activeOccurrenceCount] = await Promise.all([
      this.ticketOccurrenceRepository.count({
        where: { ticket: { id: ticketId } },
      }),
      this.ticketOccurrenceRepository.count({
        where: { ticket: { id: ticketId }, is_active: true },
      }),
    ]);

    return this.mapTicketToDetails(
      ticket,
      occurrenceCount,
      activeOccurrenceCount,
    );
  }

  /**
   * Get vulnerability details for a ticket
   * Returns full vulnerability information including CVSS, EPSS, VLAI, weaknesses, and references
   */
  async getVulnerabilityDetails(
    orgId: string,
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<VulnerabilityDetailsReport | null> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    // Get the ticket with its analysis reference
    const ticket = await this.ticketRepository.findOne({
      where: {
        id: ticketId,
        organization: { id: orgId },
      },
      relations: ["project", "source_analysis"],
    });

    if (!ticket) {
      throw new EntityNotFound();
    }

    // If ticket has no vulnerability_id, we can't fetch details
    if (!ticket.vulnerability_id) {
      return null;
    }

    // If ticket has source_analysis, use the full vulnerability service
    if (ticket.source_analysis) {
      try {
        // Use the vulnerability service to get detailed info
        // Default workspace is 'default' for single-workspace analyses
        const vulnDetails = await this.vulnerabilityService.getVulnerability(
          orgId,
          ticket.project.id,
          ticket.source_analysis.id,
          user,
          ticket.vulnerability_id,
          "default",
        );

        return vulnDetails;
      } catch (error) {
        // If vulnerability details can't be fetched, try fallback
        console.error(
          `Failed to fetch vulnerability details for ticket ${ticketId}:`,
          (error as Error).message,
        );
        // Fall through to knowledge DB fallback
      }
    }

    // Fallback: fetch vulnerability data directly from knowledge database
    // This handles tickets without source_analysis or when the full service fails
    return this.getVulnerabilityFromKnowledge(ticket.vulnerability_id);
  }

  /**
   * Fetch vulnerability details directly from knowledge database
   * Used as fallback when ticket doesn't have a source_analysis
   */
  private async getVulnerabilityFromKnowledge(
    vulnerabilityId: string,
  ): Promise<VulnerabilityDetailsReport | null> {
    try {
      const nvdData =
        await this.nvdRepository.getVulnWithoutFailing(vulnerabilityId);

      let osvData: OSV | null = null;
      if (vulnerabilityId.startsWith("CVE")) {
        osvData =
          await this.osvRepository.getVulnByCVEIDWithoutFailing(
            vulnerabilityId,
          );
      }

      if (!nvdData && !osvData) {
        return null;
      }

      const epssData = await this.epssRepository.getByCVE(vulnerabilityId);

      // Extract CVSS from NVD metrics JSON
      const severities = this.extractSeveritiesFromNVD(nvdData);

      // Extract description from NVD or OSV
      const description = this.extractDescription(nvdData, osvData);

      // Extract references
      const references = this.extractReferences(nvdData, osvData);

      // Build sources array
      const sources: VulnSourceInfo[] = [];
      if (nvdData) {
        sources.push({
          name: "NVD",
          vuln_url: `https://nvd.nist.gov/vuln/detail/${vulnerabilityId}`,
        });
      }
      if (osvData) {
        sources.push({
          name: "OSV",
          vuln_url: `https://osv.dev/vulnerability/${osvData.osv_id}`,
        });
      }

      // Build other info with EPSS and VLAI (extended OtherInfo)
      const otherInfo = {
        package_manager: "unknown",
        epss_score: epssData?.score ?? undefined,
        epss_percentile: epssData?.percentile ?? undefined,
        vlai_score: nvdData?.vlai_score ?? undefined,
        vlai_confidence: nvdData?.vlai_confidence ?? undefined,
      };

      return {
        vulnerability_info: {
          vulnerability_id: vulnerabilityId,
          description,
          version_info: {
            affected_versions_string: "",
            patched_versions_string: "",
            versions: [],
          },
          published: nvdData?.published ?? osvData?.published ?? "",
          last_modified: nvdData?.lastModified ?? osvData?.modified ?? "",
          sources,
          aliases: [],
        },
        severities,
        owasp_top_10: null,
        weaknesses: [],
        patch: null as unknown as VulnerabilityDetailsReport["patch"],
        common_consequences: {},
        references,
        location: [],
        other: otherInfo as unknown as VulnerabilityDetailsReport["other"],
      };
    } catch (error) {
      console.error(
        `Failed to fetch vulnerability from knowledge DB for ${vulnerabilityId}:`,
        (error as Error).message,
      );
      return null;
    }
  }

  /**
   * Build a CVSS v3.x object from raw metrics data
   */
  private buildCvssV3(data: Record<string, unknown>): CVSS31 {
    return {
      base_score: (data["baseScore"] as number) ?? 0,
      exploitability_score: (data["exploitabilityScore"] as number) ?? 0,
      impact_score: (data["impactScore"] as number) ?? 0,
      attack_vector: (data["attackVector"] as string) ?? "",
      attack_complexity: (data["attackComplexity"] as string) ?? "",
      privileges_required: (data["privilegesRequired"] as string) ?? "",
      user_interaction: (data["userInteraction"] as string) ?? "",
      scope: (data["scope"] as string) ?? "",
      confidentiality_impact: (data["confidentialityImpact"] as string) ?? "",
      integrity_impact: (data["integrityImpact"] as string) ?? "",
      availability_impact: (data["availabilityImpact"] as string) ?? "",
    };
  }

  /**
   * Build a CVSS v2 object from raw metrics data
   */
  private buildCvssV2(data: Record<string, unknown>): CVSS2 {
    return {
      base_score: (data["baseScore"] as number) ?? 0,
      exploitability_score: (data["exploitabilityScore"] as number) ?? 0,
      impact_score: (data["impactScore"] as number) ?? 0,
      access_vector: (data["accessVector"] as string) ?? "",
      access_complexity: (data["accessComplexity"] as string) ?? "",
      authentication: (data["authentication"] as string) ?? "",
      confidentiality_impact: (data["confidentialityImpact"] as string) ?? "",
      integrity_impact: (data["integrityImpact"] as string) ?? "",
      availability_impact: (data["availabilityImpact"] as string) ?? "",
    };
  }

  /**
   * Extract CVSS scores from NVD metrics JSON
   */
  private extractSeveritiesFromNVD(nvdData: NVD | null): SeverityInfo {
    if (!nvdData?.metrics) return {};

    const metrics = nvdData.metrics as {
      cvssMetricV31?: { cvssData: Record<string, unknown> }[];
      cvssMetricV30?: { cvssData: Record<string, unknown> }[];
      cvssMetricV2?: { cvssData: Record<string, unknown> }[];
    };

    const severities: SeverityInfo = {};

    if (metrics.cvssMetricV31?.[0]?.cvssData) {
      severities.cvss_31 = this.buildCvssV3(metrics.cvssMetricV31[0].cvssData);
    }

    if (metrics.cvssMetricV30?.[0]?.cvssData) {
      severities.cvss_3 = this.buildCvssV3(metrics.cvssMetricV30[0].cvssData);
    }

    if (metrics.cvssMetricV2?.[0]?.cvssData) {
      severities.cvss_2 = this.buildCvssV2(metrics.cvssMetricV2[0].cvssData);
    }

    return severities;
  }

  /**
   * Extract description from NVD or OSV
   */
  private extractDescription(nvdData: NVD | null, osvData: OSV | null): string {
    if (nvdData?.descriptions) {
      const descriptions = nvdData.descriptions as {
        lang: string;
        value: string;
      }[];
      const en = descriptions.find((d) => d.lang === "en");
      if (en) return en.value;
    }
    return osvData?.details ?? "";
  }

  /**
   * Extract references from NVD or OSV
   */
  private extractReferences(
    nvdData: NVD | null,
    osvData: OSV | null,
  ): ReferenceInfo[] {
    if (nvdData?.references) {
      const refs = nvdData.references as { url: string; tags?: string[] }[];
      return refs.map((r) => ({ url: r.url, tags: r.tags ?? [] }));
    }
    if (osvData?.references) {
      const refs = osvData.references as { url: string; type?: string }[];
      return refs.map((r) => ({ url: r.url, tags: r.type ? [r.type] : [] }));
    }
    return [];
  }

  /**
   * Get paginated list of tickets
   */
  async getMany(
    orgId: string,
    paginationUserSuppliedConf: PaginationUserSuppliedConf,
    user: AuthenticatedUser,
    filters?: TicketFilters,
    searchKey?: string,
    sortBy?: TicketSortField,
    sortDirection?: SortDirection,
  ): Promise<TypedPaginatedData<TicketSummary>> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const paginationConfig: PaginationConfig = {
      maxEntriesPerPage: 100,
      defaultEntriesPerPage: 20,
    };

    let entriesPerPage = paginationConfig.defaultEntriesPerPage;
    let currentPage = 0;

    if (paginationUserSuppliedConf.entriesPerPage)
      entriesPerPage = Math.min(
        paginationConfig.maxEntriesPerPage,
        paginationUserSuppliedConf.entriesPerPage,
      );

    if (paginationUserSuppliedConf.currentPage)
      currentPage = Math.max(0, paginationUserSuppliedConf.currentPage);

    const queryBuilder = this.ticketRepository
      .createQueryBuilder("ticket")
      .leftJoinAndSelect("ticket.project", "project")
      .leftJoinAndSelect("ticket.assigned_to", "assigned_to")
      .leftJoin("ticket.external_links", "external_links")
      .addSelect("COUNT(DISTINCT external_links.id)", "external_link_count")
      .where("ticket.organization.id = :orgId", { orgId })
      .groupBy("ticket.id")
      .addGroupBy("project.id")
      .addGroupBy("assigned_to.id");

    // Apply filters
    if (filters?.status?.length) {
      queryBuilder.andWhere("ticket.status IN (:...statuses)", {
        statuses: filters.status,
      });
    }
    if (filters?.priority?.length) {
      queryBuilder.andWhere("ticket.priority IN (:...priorities)", {
        priorities: filters.priority,
      });
    }
    if (filters?.type?.length) {
      queryBuilder.andWhere("ticket.type IN (:...types)", {
        types: filters.type,
      });
    }
    if (filters?.project_id) {
      queryBuilder.andWhere("project.id = :projectId", {
        projectId: filters.project_id,
      });
    }
    if (filters?.assigned_to_id) {
      queryBuilder.andWhere("assigned_to.id = :assignedToId", {
        assignedToId: filters.assigned_to_id,
      });
    }
    if (filters?.vulnerability_id) {
      queryBuilder.andWhere("ticket.vulnerability_id = :vulnId", {
        vulnId: filters.vulnerability_id,
      });
    }
    if (filters?.severity_class?.length) {
      queryBuilder.andWhere("ticket.severity_class IN (:...severityClasses)", {
        severityClasses: filters.severity_class,
      });
    }
    if (filters?.created_after) {
      queryBuilder.andWhere("ticket.created_on >= :createdAfter", {
        createdAfter: filters.created_after,
      });
    }
    if (filters?.created_before) {
      queryBuilder.andWhere("ticket.created_on <= :createdBefore", {
        createdBefore: filters.created_before,
      });
    }

    // Apply search
    if (searchKey?.trim()) {
      queryBuilder.andWhere(
        "(ticket.title ILIKE :searchKey OR ticket.vulnerability_id ILIKE :searchKey OR ticket.affected_package ILIKE :searchKey)",
        { searchKey: `%${searchKey.trim()}%` },
      );
    }

    // Apply sorting
    const validSortFields: TicketSortField[] = [
      "created_on",
      "updated_on",
      "priority",
      "status",
      "severity_score",
      "title",
      "due_date",
    ];
    if (sortBy && validSortFields.includes(sortBy)) {
      const direction = sortDirection === SortDirection.ASC ? "ASC" : "DESC";
      queryBuilder.orderBy(`ticket.${sortBy}`, direction);
    } else {
      queryBuilder.orderBy("ticket.created_on", "DESC");
    }

    // Get total count
    const fullCount = await this.ticketRepository
      .createQueryBuilder("ticket")
      .where("ticket.organization.id = :orgId", { orgId })
      .getCount();

    const tickets = await queryBuilder
      .skip(currentPage * entriesPerPage)
      .take(entriesPerPage)
      .getRawAndEntities<Ticket>();

    const rawRows = tickets.raw as unknown as RawTicketWithExternalLinkCount[];

    const res: TicketSummary[] = tickets.entities.map((ticket, index) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      vulnerability_id: ticket.vulnerability_id,
      affected_package: ticket.affected_package,
      severity_score: ticket.severity_score,
      severity_class: ticket.severity_class,
      created_on: ticket.created_on,
      updated_on: ticket.updated_on,
      project_id: ticket.project?.id ?? "",
      project_name: ticket.project?.name ?? "",
      assigned_to_id: ticket.assigned_to?.id,
      assigned_to_name: getUserFullName(ticket.assigned_to),
      has_external_links:
        parseInt(rawRows[index]?.external_link_count ?? "0") > 0,
      external_status: ticket.external_status,
    }));

    return {
      data: res,
      page: currentPage,
      entry_count: tickets.entities.length,
      entries_per_page: entriesPerPage,
      total_entries: fullCount,
      total_pages: Math.ceil(fullCount / entriesPerPage),
      matching_count: fullCount,
      filter_count: {},
    };
  }

  /**
   * Update a ticket
   */
  async update(
    orgId: string,
    ticketId: string,
    updateBody: UpdateTicketBody,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const ticket = await this.ticketRepository.findOne({
      where: {
        id: ticketId,
        organization: { id: orgId },
      },
      relations: ["assigned_to"],
    });

    if (!ticket) {
      throw new EntityNotFound();
    }

    const performer = await this.usersRepository.getUserById(user.userId);
    const now = new Date();
    const events: Partial<TicketEvent>[] = [];
    let statusChanged = false;
    let newStatus: TicketStatus | undefined;

    // Track status change
    if (updateBody.status && updateBody.status !== ticket.status) {
      statusChanged = true;
      newStatus = updateBody.status;
      events.push({
        ticket,
        event_type: TicketEventType.STATUS_CHANGED,
        event_data: {
          old_status: ticket.status,
          new_status: updateBody.status,
          source: "manual",
        },
        performed_by: performer,
        created_on: now,
      });

      // Set resolved_on if transitioning to resolved
      if (
        updateBody.status === TicketStatus.RESOLVED &&
        ticket.status !== TicketStatus.RESOLVED
      ) {
        ticket.resolved_on = now;
      }
      // Clear resolved_on if reopening
      if (
        ticket.status === TicketStatus.RESOLVED &&
        updateBody.status !== TicketStatus.RESOLVED
      ) {
        ticket.resolved_on = undefined;
        events.push({
          ticket,
          event_type: TicketEventType.REOPENED,
          event_data: { source: "manual" },
          performed_by: performer,
          created_on: now,
        });
      }

      ticket.status = updateBody.status;

      // Also update external_status synchronously for immediate UI feedback
      // The async ClickUp sync will update the actual external system
      const statusToExternalMap: Record<TicketStatus, string> = {
        [TicketStatus.OPEN]: "to do",
        [TicketStatus.IN_PROGRESS]: "in progress",
        [TicketStatus.RESOLVED]: "complete",
        [TicketStatus.CLOSED]: "complete",
        [TicketStatus.WONT_FIX]: "complete",
      };
      ticket.external_status = statusToExternalMap[updateBody.status];
    }

    // Track priority change
    if (updateBody.priority && updateBody.priority !== ticket.priority) {
      events.push({
        ticket,
        event_type: TicketEventType.PRIORITY_CHANGED,
        event_data: {
          old_priority: ticket.priority,
          new_priority: updateBody.priority,
          source: "manual",
        },
        performed_by: performer,
        created_on: now,
      });
      ticket.priority = updateBody.priority;
    }

    // Track assignment change
    if (updateBody.assigned_to_id !== undefined) {
      const oldAssignedId = ticket.assigned_to?.id;
      if (updateBody.assigned_to_id !== oldAssignedId) {
        if (updateBody.assigned_to_id) {
          const assignee = await this.usersRepository.getUserById(
            updateBody.assigned_to_id,
          );
          ticket.assigned_to = assignee;
          events.push({
            ticket,
            event_type: TicketEventType.ASSIGNED,
            event_data: {
              assigned_to_id: assignee.id,
              assigned_to_name: `${assignee.first_name} ${assignee.last_name}`,
              source: "manual",
            },
            performed_by: performer,
            created_on: now,
          });
        } else {
          ticket.assigned_to = undefined;
          events.push({
            ticket,
            event_type: TicketEventType.UNASSIGNED,
            event_data: { source: "manual" },
            performed_by: performer,
            created_on: now,
          });
        }
      }
    }

    // Track due date change
    if (updateBody.due_date !== undefined) {
      const newDueDate = updateBody.due_date
        ? new Date(updateBody.due_date)
        : undefined;
      if (newDueDate?.getTime() !== ticket.due_date?.getTime()) {
        events.push({
          ticket,
          event_type: TicketEventType.DUE_DATE_CHANGED,
          event_data: {
            old_due_date: ticket.due_date?.toISOString(),
            new_due_date: newDueDate?.toISOString(),
            source: "manual",
          },
          performed_by: performer,
          created_on: now,
        });
        ticket.due_date = newDueDate;
      }
    }

    // Apply other updates
    if (updateBody.title !== undefined) ticket.title = updateBody.title;
    if (updateBody.description !== undefined)
      ticket.description = updateBody.description;
    if (updateBody.remediation_notes !== undefined)
      ticket.remediation_notes = updateBody.remediation_notes;

    ticket.updated_on = now;

    await this.ticketRepository.save(ticket);

    // Save events
    if (events.length > 0) {
      await this.ticketEventRepository.save(events);
    }

    // Sync status change to external providers (ClickUp, etc.)
    if (statusChanged && newStatus) {
      // Fire and forget - don't block the response
      this.ticketIntegrationService
        .updateExternalTicketStatus(ticketId, newStatus)
        .catch((error) => {
          // Log but don't fail the update
          console.error("Failed to sync status to external provider:", error);
        });
    }
  }

  /**
   * Bulk update tickets
   */
  async bulkUpdate(
    orgId: string,
    bulkUpdateBody: BulkUpdateTicketsBody,
    user: AuthenticatedUser,
  ): Promise<BulkUpdateResult> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const tickets = await this.ticketRepository.find({
      where: {
        id: In(bulkUpdateBody.ticket_ids),
        organization: { id: orgId },
      },
    });

    if (tickets.length === 0) {
      return { updated_count: 0, ticket_ids: [] };
    }

    const performer = await this.usersRepository.getUserById(user.userId);
    const now = new Date();
    const events: Partial<TicketEvent>[] = [];

    for (const ticket of tickets) {
      if (bulkUpdateBody.status && bulkUpdateBody.status !== ticket.status) {
        events.push({
          ticket,
          event_type: TicketEventType.STATUS_CHANGED,
          event_data: {
            old_status: ticket.status,
            new_status: bulkUpdateBody.status,
            source: "manual",
          },
          performed_by: performer,
          created_on: now,
        });
        ticket.status = bulkUpdateBody.status;
        if (bulkUpdateBody.status === TicketStatus.RESOLVED) {
          ticket.resolved_on = now;
        }
      }

      if (
        bulkUpdateBody.priority &&
        bulkUpdateBody.priority !== ticket.priority
      ) {
        events.push({
          ticket,
          event_type: TicketEventType.PRIORITY_CHANGED,
          event_data: {
            old_priority: ticket.priority,
            new_priority: bulkUpdateBody.priority,
            source: "manual",
          },
          performed_by: performer,
          created_on: now,
        });
        ticket.priority = bulkUpdateBody.priority;
      }

      ticket.updated_on = now;
    }

    await this.ticketRepository.save(tickets);

    if (events.length > 0) {
      await this.ticketEventRepository.save(events);
    }

    return {
      updated_count: tickets.length,
      ticket_ids: tickets.map((t) => t.id),
    };
  }

  /**
   * Delete a ticket
   */
  async delete(
    orgId: string,
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    // Only admins can delete tickets
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.ADMIN,
    );

    const ticket = await this.ticketRepository.findOne({
      where: {
        id: ticketId,
        organization: { id: orgId },
      },
    });

    if (!ticket) {
      throw new EntityNotFound();
    }

    await this.ticketRepository.remove(ticket);
  }

  /**
   * Get ticket events/activity
   */
  async getEvents(
    orgId: string,
    ticketId: string,
    user: AuthenticatedUser,
  ): Promise<TicketEvent[]> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const ticket = await this.ticketRepository.findOne({
      where: {
        id: ticketId,
        organization: { id: orgId },
      },
    });

    if (!ticket) {
      throw new EntityNotFound();
    }

    return this.ticketEventRepository.find({
      where: { ticket: { id: ticketId } },
      relations: ["performed_by"],
      order: { created_on: "DESC" },
    });
  }

  /**
   * Check if a ticket already exists for a vulnerability
   */
  async checkDuplicate(
    orgId: string,
    projectId: string,
    vulnerabilityId: string,
    user: AuthenticatedUser,
  ): Promise<DuplicateCheckResult> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const existing = await this.ticketRepository.findOne({
      where: {
        organization: { id: orgId },
        project: { id: projectId },
        vulnerability_id: vulnerabilityId,
      },
    });

    if (existing) {
      return {
        exists: true,
        existing_ticket_id: existing.id,
        existing_ticket_title: existing.title,
        existing_ticket_status: existing.status,
      };
    }

    return { exists: false };
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(
    orgId: string,
    user: AuthenticatedUser,
    _integrationIds?: string[],
  ): Promise<TicketDashboardStats> {
    await this.membershipsRepository.hasRequiredRole(
      orgId,
      user.userId,
      MemberRole.USER,
    );

    const baseQuery = this.ticketRepository
      .createQueryBuilder("ticket")
      .leftJoin("ticket.project", "project")
      .where("ticket.organization.id = :orgId", { orgId });

    // Get counts by status
    const [openCount, inProgressCount, resolvedThisWeek, closedCount] =
      await Promise.all([
        baseQuery
          .clone()
          .andWhere("ticket.status = :status", { status: TicketStatus.OPEN })
          .getCount(),
        baseQuery
          .clone()
          .andWhere("ticket.status = :status", {
            status: TicketStatus.IN_PROGRESS,
          })
          .getCount(),
        baseQuery
          .clone()
          .andWhere("ticket.status = :status", {
            status: TicketStatus.RESOLVED,
          })
          .andWhere("ticket.resolved_on >= :weekAgo", {
            weekAgo: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          })
          .getCount(),
        baseQuery
          .clone()
          .andWhere("ticket.status = :status", { status: TicketStatus.CLOSED })
          .getCount(),
      ]);

    // Get counts by priority (for open and in-progress tickets)
    const priorityCounts: RawPriorityCount[] = await this.ticketRepository
      .createQueryBuilder("ticket")
      .select("ticket.priority", "priority")
      .addSelect("COUNT(*)", "count")
      .where("ticket.organization.id = :orgId", { orgId })
      .andWhere("ticket.status IN (:...statuses)", {
        statuses: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
      })
      .groupBy("ticket.priority")
      .getRawMany();

    const byPriority = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const row of priorityCounts) {
      const key = row.priority.toLowerCase() as keyof typeof byPriority;
      if (key in byPriority) {
        byPriority[key] = parseInt(row.count, 10);
      }
    }

    // Get open tickets by project
    const byProject: RawProjectCount[] = await this.ticketRepository
      .createQueryBuilder("ticket")
      .select("project.id", "project_id")
      .addSelect("project.name", "project_name")
      .addSelect("COUNT(*)", "open_count")
      .leftJoin("ticket.project", "project")
      .where("ticket.organization.id = :orgId", { orgId })
      .andWhere("ticket.status IN (:...statuses)", {
        statuses: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
      })
      .groupBy("project.id")
      .addGroupBy("project.name")
      .orderBy("open_count", "DESC")
      .limit(5)
      .getRawMany();

    // Get recent tickets
    const recentTickets = await this.ticketRepository.find({
      where: { organization: { id: orgId } },
      relations: ["project", "assigned_to"],
      order: { created_on: "DESC" },
      take: 5,
    });

    // Calculate average resolution time
    const resolvedTickets: RawAverageResolutionTime | undefined =
      await this.ticketRepository
        .createQueryBuilder("ticket")
        .select(
          "AVG(EXTRACT(EPOCH FROM (ticket.resolved_on - ticket.created_on)) / 86400)",
          "avg_days",
        )
        .where("ticket.organization.id = :orgId", { orgId })
        .andWhere("ticket.resolved_on IS NOT NULL")
        .getRawOne();

    return {
      total_open: openCount,
      total_in_progress: inProgressCount,
      total_resolved_this_week: resolvedThisWeek,
      total_closed: closedCount,
      by_priority: byPriority,
      by_project: byProject.map((row) => ({
        project_id: row.project_id,
        project_name: row.project_name,
        open_count: parseInt(row.open_count, 10),
      })),
      recent_tickets: recentTickets.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        vulnerability_id: t.vulnerability_id,
        affected_package: t.affected_package,
        severity_score: t.severity_score,
        severity_class: t.severity_class,
        created_on: t.created_on,
        updated_on: t.updated_on,
        project_id: t.project?.id ?? "",
        project_name: t.project?.name ?? "",
        assigned_to_id: t.assigned_to?.id,
        assigned_to_name: getUserFullName(t.assigned_to),
        has_external_links: false,
        external_status: t.external_status,
      })),
      avg_resolution_time_days: resolvedTickets?.avg_days
        ? parseFloat(resolvedTickets.avg_days)
        : null,
    };
  }

  /**
   * Map ticket entity to details response
   */
  private mapTicketToDetails(
    ticket: Ticket,
    occurrenceCount: number,
    activeOccurrenceCount: number,
  ): TicketDetails {
    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      type: ticket.type,
      vulnerability_id: ticket.vulnerability_id,
      affected_package: ticket.affected_package,
      affected_version: ticket.affected_version,
      severity_score: ticket.severity_score,
      severity_class: ticket.severity_class,
      recommended_version: ticket.recommended_version,
      remediation_notes: ticket.remediation_notes,
      created_on: ticket.created_on,
      updated_on: ticket.updated_on,
      resolved_on: ticket.resolved_on,
      due_date: ticket.due_date,
      project_id: ticket.project?.id || "",
      project_name: ticket.project?.name || "",
      created_by_id: ticket.created_by?.id || "",
      created_by_name: ticket.created_by
        ? `${ticket.created_by.first_name} ${ticket.created_by.last_name}`
        : "",
      assigned_to_id: ticket.assigned_to?.id,
      assigned_to_name: ticket.assigned_to
        ? `${ticket.assigned_to.first_name} ${ticket.assigned_to.last_name}`
        : undefined,
      source_analysis_id: ticket.source_analysis?.id,
      external_links: (ticket.external_links || []).map((link) => ({
        id: link.id,
        provider: link.provider,
        external_id: link.external_id,
        external_url: link.external_url,
        synced_on: link.synced_on,
      })),
      has_external_links: (ticket.external_links?.length || 0) > 0,
      external_status: ticket.external_status,
      occurrence_count: occurrenceCount,
      active_occurrence_count: activeOccurrenceCount,
    };
  }
}
