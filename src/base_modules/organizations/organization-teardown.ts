import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";

import { ProjectRowsService } from "../projects/project-rows.service";

/** Rows of a table whose ids are returned by a query. */
async function ids(
  manager: EntityManager,
  sql: string,
  params: unknown[],
): Promise<string[]> {
  const rows: { id: string }[] = await manager.query(sql, params);
  return rows.map((r) => r.id);
}

/**
 * Deletes what an organization owns, inside the caller's transaction, so the
 * organization row itself can then be deleted.
 */
@Injectable()
export class OrganizationTeardown {
  constructor(private readonly projectRows: ProjectRowsService) {}

  /**
   * Deletes the organization's projects, analyses, analyzers, tickets,
   * experiments, invitations, audit logs, and the integrations and policies
   * linked only to it; unlinks the ones it shares. Members whose default
   * organization it was get their personal organization instead.
   * @returns The ids of the deleted projects, whose folders the caller removes after the commit.
   */
  async deleteContents(
    orgId: string,
    manager: EntityManager,
  ): Promise<string[]> {
    // Projects also linked to another organization are only unlinked
    const projectIds = await ids(
      manager,
      `SELECT op."projectId" AS id FROM organization_projects_project op
       WHERE op."organizationId" = $1
         AND NOT EXISTS (SELECT 1 FROM organization_projects_project other
                         WHERE other."projectId" = op."projectId" AND other."organizationId" <> $1)`,
      [orgId],
    );
    await this.projectRows.deleteRows(orgId, projectIds, manager);

    const analysisIds = await ids(
      manager,
      `SELECT id FROM analysis WHERE "organizationId" = $1`,
      [orgId],
    );
    await this.projectRows.deleteAnalyses(analysisIds, manager);

    // Events, links and occurrences cascade with the ticket
    await manager.query(`DELETE FROM ticket WHERE "organizationId" = $1`, [
      orgId,
    ]);
    // Experiments go before the datasets they use
    await manager.query(`DELETE FROM experiment WHERE "organizationId" = $1`, [
      orgId,
    ]);
    await manager.query(`DELETE FROM dataset WHERE "organizationId" = $1`, [
      orgId,
    ]);
    await manager.query(`DELETE FROM analyzer WHERE "organizationId" = $1`, [
      orgId,
    ]);
    await manager.query(`DELETE FROM invitation WHERE "organizationId" = $1`, [
      orgId,
    ]);
    await manager.query(
      `DELETE FROM log WHERE organization_id = $1 OR "organizationId"::text = $1`,
      [orgId],
    );

    await this.deletePolicies(orgId, manager);
    await this.deleteIntegrations(orgId, manager);
    await this.resetDefaultOrganization(orgId, manager);
    return projectIds;
  }

  /** Delete the policies linked only to this organization; unlink the rest. */
  private async deletePolicies(
    orgId: string,
    manager: EntityManager,
  ): Promise<void> {
    const policyIds = await ids(
      manager,
      `SELECT "policyId" AS id FROM organization_policies_policy WHERE "organizationId" = $1`,
      [orgId],
    );
    await manager.query(
      `DELETE FROM organization_policies_policy WHERE "organizationId" = $1`,
      [orgId],
    );
    if (policyIds.length === 0) return;
    await manager.query(
      `DELETE FROM policy p WHERE p.id = ANY($1)
         AND NOT EXISTS (SELECT 1 FROM organization_policies_policy op WHERE op."policyId" = p.id)`,
      [policyIds],
    );
  }

  /** Delete the integrations linked only to this organization; unlink the rest. */
  private async deleteIntegrations(
    orgId: string,
    manager: EntityManager,
  ): Promise<void> {
    const linked = await ids(
      manager,
      `SELECT "integrationId" AS id FROM organization_integrations_integration WHERE "organizationId" = $1`,
      [orgId],
    );
    await manager.query(
      `DELETE FROM organization_integrations_integration WHERE "organizationId" = $1`,
      [orgId],
    );
    if (linked.length === 0) return;
    const integrationIds = await ids(
      manager,
      `SELECT i.id FROM integration i WHERE i.id = ANY($1)
         AND NOT EXISTS (SELECT 1 FROM organization_integrations_integration oi WHERE oi."integrationId" = i.id)`,
      [linked],
    );
    if (integrationIds.length === 0) return;
    await manager.query(
      `DELETE FROM user_integrations_integration WHERE "integrationId" = ANY($1)`,
      [integrationIds],
    );
    // An integration and its repository cache point at each other
    await manager.query(
      `UPDATE integration SET "repositoryCacheId" = NULL
       WHERE "repositoryCacheId" IN (SELECT id FROM repository_cache WHERE "integrationId" = ANY($1))`,
      [integrationIds],
    );
    await manager.query(
      `DELETE FROM repository_cache WHERE "integrationId" = ANY($1)`,
      [integrationIds],
    );
    await manager.query(`DELETE FROM integration WHERE id = ANY($1)`, [
      integrationIds,
    ]);
  }

  /** Point users whose default was this organization at their personal one. */
  private async resetDefaultOrganization(
    orgId: string,
    manager: EntityManager,
  ): Promise<void> {
    await manager.query(
      `UPDATE "user" u SET default_org = (
         SELECT o.id FROM organization o
         WHERE o.personal AND o."createdById" = u.id AND o.id <> $1
         ORDER BY o.created_on LIMIT 1)
       WHERE u.default_org = $1`,
      [orgId],
    );
  }
}
