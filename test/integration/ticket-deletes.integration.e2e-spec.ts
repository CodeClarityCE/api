import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import {
  createAnalysisWithPolicies,
  createProject,
} from "../utils/deletion-fixtures";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

describe("Deleting projects and analyses that have tickets (e2e)", () => {
  let owner: TestUser;
  let projectId: string;
  let analysisId: string;
  let otherAnalysisId: string;
  let ticketId: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    owner = await testHelper.createTestUser({
      email: "owner@ticketdeletes.com",
      role: MemberRole.ADMIN,
    });
    projectId = await createProject(owner, "ticket-project");
    analysisId = await createAnalysisWithPolicies(owner, projectId);
    otherAnalysisId = await createAnalysisWithPolicies(owner, projectId);
    ticketId = await createTicket(projectId, analysisId);
  });

  function db(): ReturnType<typeof testHelper.getDataSource> {
    return testHelper.getDataSource();
  }

  async function count(sql: string, param: string): Promise<number> {
    const rows = await db().query(sql, [param]);
    return Number(rows[0].n);
  }

  // A ticket found by `sourceAnalysis`, with an event, a ClickUp link and
  // one occurrence in each analysis.
  async function createTicket(
    project: string,
    sourceAnalysis: string,
  ): Promise<string> {
    const response = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${owner.organization.id}/tickets`,
      owner.accessToken,
      {
        title: "Upgrade lodash",
        description: "Fix the prototype pollution",
        priority: "HIGH",
        type: "VULNERABILITY",
        project_id: project,
      },
    );
    expect(response.statusCode).toBe(201);
    const id: string = response.json().id;
    await db().query(
      `UPDATE ticket SET "sourceAnalysisId" = $1 WHERE id = $2`,
      [sourceAnalysis, id],
    );
    await db().query(
      `INSERT INTO ticket_external_link (provider, external_id, external_url, synced_on, "ticketId")
       VALUES ('CLICKUP', 'task-1', 'https://app.clickup.com/t/task-1', now(), $1)`,
      [id],
    );
    for (const analysis of [analysisId, otherAnalysisId]) {
      await db().query(
        `INSERT INTO ticket_vulnerability_occurrence (workspace, affected_paths, detected_on, "ticketId", "analysisId")
         VALUES ('.', '[]', now(), $1, $2)`,
        [id, analysis],
      );
    }
    return id;
  }

  async function ticketRows(id: string): Promise<Record<string, number>> {
    return {
      tickets: await count(`SELECT count(*) n FROM ticket WHERE id = $1`, id),
      events: await count(
        `SELECT count(*) n FROM ticket_event WHERE "ticketId" = $1`,
        id,
      ),
      links: await count(
        `SELECT count(*) n FROM ticket_external_link WHERE "ticketId" = $1`,
        id,
      ),
      occurrences: await count(
        `SELECT count(*) n FROM ticket_vulnerability_occurrence WHERE "ticketId" = $1`,
        id,
      ),
    };
  }

  function projectCount(id: string): Promise<number> {
    return count(`SELECT count(*) n FROM project WHERE id = $1`, id);
  }

  it("starts with a ticket that has an event, a link and two occurrences", async () => {
    expect(await ticketRows(ticketId)).toEqual({
      tickets: 1,
      events: 1,
      links: 1,
      occurrences: 2,
    });
  });

  describe("deleting a project", () => {
    it("deletes its tickets with their events, links and occurrences", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${owner.organization.id}/projects/${projectId}`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      expect(await projectCount(projectId)).toBe(0);
      expect(await ticketRows(ticketId)).toEqual({
        tickets: 0,
        events: 0,
        links: 0,
        occurrences: 0,
      });
    });

    it("deletes them in a bulk delete too", async () => {
      const otherProject = await createProject(owner, "other-project");
      const otherAnalysis = await createAnalysisWithPolicies(
        owner,
        otherProject,
      );
      const otherTicket = await createTicket(otherProject, otherAnalysis);

      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${owner.organization.id}/projects/batch-delete`,
        owner.accessToken,
        { project_ids: [projectId, otherProject] },
      );

      expect(response.statusCode).toBe(201);
      expect(response.json().data.succeeded).toBe(2);
      for (const id of [ticketId, otherTicket]) {
        expect(await ticketRows(id)).toEqual({
          tickets: 0,
          events: 0,
          links: 0,
          occurrences: 0,
        });
      }
    });
  });

  describe("deleting an analysis", () => {
    async function expectTicketKept(): Promise<void> {
      expect(await ticketRows(ticketId)).toEqual({
        tickets: 1,
        events: 1,
        links: 1,
        occurrences: 1,
      });
      const [row] = await db().query(
        `SELECT "sourceAnalysisId", (SELECT "analysisId" FROM ticket_vulnerability_occurrence WHERE "ticketId" = $1) AS occurrence
         FROM ticket WHERE id = $1`,
        [ticketId],
      );
      expect(row).toEqual({
        sourceAnalysisId: null,
        occurrence: otherAnalysisId,
      });

      const detail = await testHelper.makeAuthenticatedRequest(
        "GET",
        `/org/${owner.organization.id}/tickets/${ticketId}`,
        owner.accessToken,
      );
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data).toEqual(
        expect.objectContaining({ id: ticketId, title: "Upgrade lodash" }),
      );
    }

    it("keeps the ticket, clears its source analysis and deletes that analysis's occurrences", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "DELETE",
        `/org/${owner.organization.id}/projects/${projectId}/analyses/${analysisId}`,
        owner.accessToken,
      );

      expect(response.statusCode).toBe(200);
      await expectTicketKept();
    });

    it("does the same in a bulk delete", async () => {
      const response = await testHelper.makeAuthenticatedRequest(
        "POST",
        `/org/${owner.organization.id}/projects/${projectId}/analyses/batch-delete`,
        owner.accessToken,
        { analysis_ids: [analysisId] },
      );

      expect(response.statusCode).toBe(201);
      expect(response.json().data.succeeded).toBe(1);
      await expectTicketKept();
    });
  });
});
