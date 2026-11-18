import { Organization } from "../../src/base_modules/organizations/organization.entity";

import {
  createAnalysisWithPolicies,
  createProject,
  markAnalysesRunning,
} from "./deletion-fixtures";
import { testHelper, type TestUser } from "./integration-test-helper";

/** Ids of what a used organization holds, as built by `fillOrganization`. */
export interface UsedOrganization {
  projectId: string;
  analysisId: string;
  ticketId: string;
  ownIntegrationId: string;
  sharedIntegrationId: string;
  sharedPolicyId: string;
}

async function query(sql: string, params: unknown[] = []): Promise<any[]> {
  return testHelper.getDataSource().query(sql, params);
}

/** Inserts an integration linked to the given organizations. */
async function createIntegration(
  owner: TestUser,
  orgIds: string[],
): Promise<string> {
  const [row] = await query(
    `INSERT INTO integration (integration_type, integration_provider, access_token, invalid, service_domain, added_on, "ownerId")
     VALUES ('VCS', 'GITHUB', 'not-a-real-token', false, 'github.com', now(), $1) RETURNING id`,
    [owner.user.id],
  );
  for (const orgId of orgIds) {
    await query(
      `INSERT INTO organization_integrations_integration ("organizationId", "integrationId") VALUES ($1, $2)`,
      [orgId, row.id],
    );
  }
  await query(
    `INSERT INTO user_integrations_integration ("userId", "integrationId") VALUES ($1, $2)`,
    [owner.user.id, row.id],
  );
  return row.id;
}

/**
 * Gives `owner`'s organization a project with a running analysis, results and
 * policies, a file, a ticket with an event and a link, an invitation, a ticket
 * integration config, an integration of its own with a repository cache, and
 * an integration and a policy it shares with `other`'s organization.
 */
export async function fillOrganization(
  owner: TestUser,
  other: TestUser,
): Promise<UsedOrganization> {
  const orgId = owner.organization.id;
  const projectId = await createProject(owner, "doomed-project");
  const analysisId = await createAnalysisWithPolicies(owner, projectId);
  await markAnalysesRunning([analysisId]);

  await query(
    `INSERT INTO file (added_on, type, name, "projectId", "addedById") VALUES (now(), 'zip', 'upload.zip', $1, $2)`,
    [projectId, owner.user.id],
  );

  const ticket = await testHelper.makeAuthenticatedRequest(
    "POST",
    `/org/${orgId}/tickets`,
    owner.accessToken,
    {
      title: "Upgrade lodash",
      description: "Fix the prototype pollution",
      priority: "HIGH",
      type: "VULNERABILITY",
      project_id: projectId,
    },
  );
  if (ticket.statusCode !== 201) throw new Error(ticket.body);
  const ticketId: string = ticket.json().id;
  await query(
    `INSERT INTO ticket_external_link (provider, external_id, external_url, synced_on, "ticketId")
     VALUES ('CLICKUP', 'task-1', 'https://app.clickup.com/t/task-1', now(), $1)`,
    [ticketId],
  );
  await query(
    `INSERT INTO ticket_integration_config (provider, enabled, config, created_on, "organizationId")
     VALUES ('CLICKUP', true, '{}', now(), $1)`,
    [orgId],
  );

  const invite = await testHelper.makeAuthenticatedRequest(
    "POST",
    `/org/${orgId}/create_invite`,
    owner.accessToken,
    { user_email: other.user.email, role: 2 },
  );
  if (invite.statusCode !== 201) throw new Error(invite.body);

  const ownIntegrationId = await createIntegration(owner, [orgId]);
  const [cache] = await query(
    `INSERT INTO repository_cache (repository_type, url, default_branch, visibility, fully_qualified_name, service_domain, description, created_at, "integrationId")
     VALUES ('GITHUB', 'https://github.com/acme/app', 'main', 'public', 'acme/app', 'github.com', 'app', now(), $1) RETURNING id`,
    [ownIntegrationId],
  );
  await query(`UPDATE integration SET "repositoryCacheId" = $1 WHERE id = $2`, [
    cache.id,
    ownIntegrationId,
  ]);
  await query(`UPDATE project SET "integrationId" = $1 WHERE id = $2`, [
    ownIntegrationId,
    projectId,
  ]);
  const sharedIntegrationId = await createIntegration(owner, [
    orgId,
    other.organization.id,
  ]);

  const [policy] = await query(
    `SELECT "policyId" FROM organization_policies_policy WHERE "organizationId" = $1 LIMIT 1`,
    [orgId],
  );
  await query(
    `INSERT INTO organization_policies_policy ("organizationId", "policyId") VALUES ($1, $2)`,
    [other.organization.id, policy.policyId],
  );

  return {
    projectId,
    analysisId,
    ticketId,
    ownIntegrationId,
    sharedIntegrationId,
    sharedPolicyId: policy.policyId,
  };
}

/** Creates a personal organization for `member` and points their default at `orgId`. */
export async function givePersonalOrg(
  member: TestUser,
  orgId: string,
): Promise<string> {
  const personal = await testHelper
    .getDataSource()
    .getRepository(Organization)
    .save({
      name: "Personal",
      description: "Personal organization",
      color_scheme: "1",
      personal: true,
      created_on: new Date(),
      created_by: member.user,
    });
  await testHelper.addMembership(member.user, personal, 0);
  await query(`UPDATE "user" SET default_org = $1 WHERE id = $2`, [
    orgId,
    member.user.id,
  ]);
  return personal.id;
}

/** Counts every row that references the organization or what it held. */
export async function rowsLeft(
  orgId: string,
  held: UsedOrganization,
): Promise<Record<string, number>> {
  const count = async (sql: string, ...params: unknown[]): Promise<number> =>
    Number((await query(sql, params))[0].n);
  const { projectId, analysisId, ticketId, ownIntegrationId } = held;
  return {
    organization: await count(
      `SELECT count(*) n FROM organization WHERE id = $1`,
      orgId,
    ),
    memberships: await count(
      `SELECT count(*) n FROM organization_memberships WHERE "organizationId" = $1`,
      orgId,
    ),
    invitations: await count(
      `SELECT count(*) n FROM invitation WHERE "organizationId" = $1`,
      orgId,
    ),
    projects: await count(
      `SELECT count(*) n FROM project WHERE id = $1`,
      projectId,
    ),
    projectLinks: await count(
      `SELECT count(*) n FROM organization_projects_project WHERE "organizationId" = $1`,
      orgId,
    ),
    files: await count(
      `SELECT count(*) n FROM file WHERE "projectId" = $1`,
      projectId,
    ),
    analyses: await count(
      `SELECT count(*) n FROM analysis WHERE "organizationId" = $1 OR "projectId" = $2 OR id = $3`,
      orgId,
      projectId,
      analysisId,
    ),
    results: await count(
      `SELECT count(*) n FROM result WHERE "analysisId" = $1`,
      analysisId,
    ),
    policyAnalysisLinks: await count(
      `SELECT count(*) n FROM policy_analyses_analysis WHERE "analysisId" = $1`,
      analysisId,
    ),
    analyzers: await count(
      `SELECT count(*) n FROM analyzer WHERE "organizationId" = $1`,
      orgId,
    ),
    tickets: await count(
      `SELECT count(*) n FROM ticket WHERE "organizationId" = $1 OR id = $2`,
      orgId,
      ticketId,
    ),
    ticketEvents: await count(
      `SELECT count(*) n FROM ticket_event WHERE "ticketId" = $1`,
      ticketId,
    ),
    ticketLinks: await count(
      `SELECT count(*) n FROM ticket_external_link WHERE "ticketId" = $1`,
      ticketId,
    ),
    ticketConfigs: await count(
      `SELECT count(*) n FROM ticket_integration_config WHERE "organizationId" = $1`,
      orgId,
    ),
    integrationLinks: await count(
      `SELECT count(*) n FROM organization_integrations_integration WHERE "organizationId" = $1`,
      orgId,
    ),
    ownIntegration: await count(
      `SELECT count(*) n FROM integration WHERE id = $1`,
      ownIntegrationId,
    ),
    ownIntegrationUsers: await count(
      `SELECT count(*) n FROM user_integrations_integration WHERE "integrationId" = $1`,
      ownIntegrationId,
    ),
    repositoryCaches: await count(
      `SELECT count(*) n FROM repository_cache WHERE "integrationId" = $1`,
      ownIntegrationId,
    ),
    policyLinks: await count(
      `SELECT count(*) n FROM organization_policies_policy WHERE "organizationId" = $1`,
      orgId,
    ),
    auditLogs: await count(
      `SELECT count(*) n FROM log WHERE organization_id = $1 OR "organizationId" = $1`,
      orgId,
    ),
    defaultOrgUsers: await count(
      `SELECT count(*) n FROM "user" WHERE default_org = $1`,
      orgId,
    ),
  };
}
