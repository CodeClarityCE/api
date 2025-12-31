import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";

import {
  Analysis,
  AnalysisStatus,
} from "src/base_modules/analyses/analysis.entity";
import { Organization } from "src/base_modules/organizations/organization.entity";
import { Result } from "src/codeclarity_modules/results/result.entity";
import { Output as VulnsOutput } from "src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types";

import { Ticket, TicketStatus } from "../ticket.entity";
import { TicketEvent, TicketEventType } from "../ticket-event.entity";

/**
 * Service for automating ticket lifecycle operations.
 *
 * Handles:
 * - Auto-resolving tickets when vulnerabilities are fixed (detected by scan)
 * - Future: Auto-creating tickets from scan results
 */
@Injectable()
export class TicketAutomationService {
  private readonly logger = new Logger(TicketAutomationService.name);

  constructor(
    @InjectRepository(Ticket, "codeclarity")
    private ticketRepository: Repository<Ticket>,
    @InjectRepository(TicketEvent, "codeclarity")
    private ticketEventRepository: Repository<TicketEvent>,
    @InjectRepository(Analysis, "codeclarity")
    private analysisRepository: Repository<Analysis>,
    @InjectRepository(Organization, "codeclarity")
    private organizationRepository: Repository<Organization>,
    @InjectRepository(Result, "codeclarity")
    private resultRepository: Repository<Result>,
  ) {}

  /**
   * Process a completed analysis and auto-resolve tickets if enabled.
   *
   * This method should be called when an analysis completes successfully.
   * It checks if the organization has auto_resolve_tickets enabled and
   * resolves any tickets whose vulnerabilities are no longer detected.
   *
   * @param analysisId - The ID of the completed analysis
   * @returns Object with count of resolved tickets and their IDs
   */
  async processCompletedAnalysis(
    analysisId: string,
  ): Promise<{ resolved_count: number; ticket_ids: string[] }> {
    this.logger.log(
      `Processing completed analysis ${analysisId} for auto-resolve`,
    );

    // Get analysis with relationships
    const analysis = await this.analysisRepository.findOne({
      where: { id: analysisId },
      relations: ["organization", "project"],
    });

    if (!analysis) {
      this.logger.warn(`Analysis ${analysisId} not found`);
      return { resolved_count: 0, ticket_ids: [] };
    }

    // Check if analysis completed successfully
    if (
      analysis.status !== AnalysisStatus.SUCCESS &&
      analysis.status !== AnalysisStatus.COMPLETED
    ) {
      this.logger.log(
        `Analysis ${analysisId} status is ${analysis.status}, skipping auto-resolve`,
      );
      return { resolved_count: 0, ticket_ids: [] };
    }

    // Get organization settings
    const organization = await this.organizationRepository.findOne({
      where: { id: analysis.organization.id },
    });

    if (!organization?.auto_resolve_tickets) {
      this.logger.log(
        `Organization ${analysis.organization.id} has auto_resolve_tickets disabled`,
      );
      return { resolved_count: 0, ticket_ids: [] };
    }

    // Get vulnerability IDs from the analysis results
    const currentVulnIds =
      await this.getVulnerabilityIdsFromAnalysis(analysisId);
    this.logger.log(
      `Found ${currentVulnIds.length} vulnerabilities in analysis ${analysisId}`,
    );

    // Find and resolve tickets
    const resolvedTickets = await this.resolveFixedVulnerabilities(
      analysis.organization.id,
      analysis.project.id,
      currentVulnIds,
      analysisId,
    );

    this.logger.log(
      `Auto-resolved ${resolvedTickets.length} tickets for analysis ${analysisId}`,
    );

    return {
      resolved_count: resolvedTickets.length,
      ticket_ids: resolvedTickets,
    };
  }

  /**
   * Find tickets that can be auto-resolved based on current scan results.
   *
   * Returns open tickets for vulnerabilities that are NOT in the currentVulnIds list.
   *
   * @param orgId - Organization ID
   * @param projectId - Project ID
   * @param currentVulnIds - List of vulnerability IDs currently detected in the scan
   * @returns Array of tickets that can be resolved
   */
  async findTicketsToResolve(
    orgId: string,
    projectId: string,
    currentVulnIds: string[],
  ): Promise<Ticket[]> {
    // Find open vulnerability tickets for this project
    const openTickets = await this.ticketRepository.find({
      where: {
        organization: { id: orgId },
        project: { id: projectId },
        status: In([TicketStatus.OPEN, TicketStatus.IN_PROGRESS]),
        vulnerability_id: Not(""),
      },
    });

    // Filter to only tickets whose vulnerability is no longer detected
    const ticketsToResolve = openTickets.filter(
      (ticket) =>
        ticket.vulnerability_id &&
        !currentVulnIds.includes(ticket.vulnerability_id),
    );

    return ticketsToResolve;
  }

  /**
   * Resolve tickets for vulnerabilities that are no longer detected.
   *
   * @param orgId - Organization ID
   * @param projectId - Project ID
   * @param currentVulnIds - List of currently detected vulnerability IDs
   * @param analysisId - ID of the analysis that triggered the resolution
   * @returns Array of resolved ticket IDs
   */
  private async resolveFixedVulnerabilities(
    orgId: string,
    projectId: string,
    currentVulnIds: string[],
    analysisId: string,
  ): Promise<string[]> {
    const ticketsToResolve = await this.findTicketsToResolve(
      orgId,
      projectId,
      currentVulnIds,
    );

    if (ticketsToResolve.length === 0) {
      return [];
    }

    const now = new Date();
    const resolvedIds: string[] = [];
    const events: Partial<TicketEvent>[] = [];

    for (const ticket of ticketsToResolve) {
      // Update ticket status
      ticket.status = TicketStatus.RESOLVED;
      ticket.resolved_on = now;
      ticket.updated_on = now;

      resolvedIds.push(ticket.id);

      // Create resolution event
      events.push({
        ticket,
        event_type: TicketEventType.RESOLVED,
        event_data: {
          source: "automation",
          analysis_id: analysisId,
          vulnerability_id: ticket.vulnerability_id,
        },
        created_on: now,
        // performed_by is null for automated actions
      });

      // Also create a status change event for audit trail
      events.push({
        ticket,
        event_type: TicketEventType.STATUS_CHANGED,
        event_data: {
          old_status: ticket.status,
          new_status: TicketStatus.RESOLVED,
          source: "automation",
        },
        created_on: now,
      });
    }

    // Save all updates
    await this.ticketRepository.save(ticketsToResolve);
    await this.ticketEventRepository.save(events);

    return resolvedIds;
  }

  /**
   * Extract vulnerability IDs from an analysis result.
   *
   * Fetches the vuln-finder result and extracts all unique vulnerability IDs.
   *
   * @param analysisId - The analysis ID
   * @returns Array of vulnerability IDs (e.g., CVE-2021-44228)
   */
  private async getVulnerabilityIdsFromAnalysis(
    analysisId: string,
  ): Promise<string[]> {
    // Try to find vuln-finder result (works for both JS and multi-language)
    const result = await this.resultRepository.findOne({
      where: {
        analysis: { id: analysisId },
        plugin: In(["js-vuln-finder", "vuln-finder"]),
      },
      order: { created_on: "DESC" },
    });

    if (!result) {
      this.logger.log(
        `No vulnerability result found for analysis ${analysisId}`,
      );
      return [];
    }

    try {
      const vulnsOutput = result.result as unknown as VulnsOutput;

      if (!vulnsOutput?.workspaces) {
        return [];
      }

      // Extract vulnerability IDs from all workspaces using flatMap to reduce nesting
      const vulnIds = Object.values(vulnsOutput.workspaces)
        .flatMap((workspace) => workspace?.Vulnerabilities ?? [])
        .map((vuln) => vuln.VulnerabilityId)
        .filter((id): id is string => Boolean(id));

      return [...new Set(vulnIds)];
    } catch (error) {
      this.logger.error(
        `Error parsing vulnerability result for analysis ${analysisId}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Check if there are any pending analyses that need auto-resolve processing.
   *
   * This method can be used by a cron job or manual trigger to process
   * completed analyses that haven't been processed yet.
   *
   * Note: This requires tracking which analyses have been processed,
   * which would need an additional field on the Analysis entity or
   * a separate tracking table.
   *
   * @param since - Only check analyses completed since this date
   * @returns Count of analyses processed
   */
  async processRecentlyCompletedAnalyses(since: Date): Promise<number> {
    const completedAnalyses = await this.analysisRepository.find({
      where: {
        status: In([AnalysisStatus.SUCCESS, AnalysisStatus.COMPLETED]),
        ended_on: Not(null as unknown as Date),
      },
      relations: ["organization", "project"],
    });

    // Filter to analyses completed since the given date
    const recentAnalyses = completedAnalyses.filter(
      (a) => a.ended_on && a.ended_on >= since,
    );

    let processedCount = 0;
    for (const analysis of recentAnalyses) {
      const result = await this.processCompletedAnalysis(analysis.id);
      if (result.resolved_count > 0) {
        processedCount++;
      }
    }

    return processedCount;
  }
}
