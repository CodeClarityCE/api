import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// One finding per dependency; ids are neither CVE nor GHSA so no knowledge lookups run.
const finding = (
  id: string,
  dependency: string,
  version: string,
  score: number,
) => ({
  Id: id,
  Sources: ["NVD"],
  AffectedDependency: dependency,
  AffectedVersion: version,
  VulnerabilityId: id,
  Severity: {
    Severity: score,
    SeverityClass: "MEDIUM",
    SeverityType: "CVSS_V31",
    Vector: "",
    Impact: 0,
    Exploitability: 0,
    ConfidentialityImpact: "NONE",
    IntegrityImpact: "NONE",
    AvailabilityImpact: "NONE",
    ConfidentialityImpactNumerical: 0,
    IntegrityImpactNumerical: 0,
    AvailabilityImpactNumerical: 0,
  },
  Conflict: { ConflictWinner: "NVD", ConflictFlag: "NO_CONFLICT" },
});

// Stored order matches neither name order nor severity order.
const vulnsOutput = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        finding("TEST-0001", "lodash", "4.17.20", 5.0),
        finding("TEST-0002", "axios", "0.21.1", 9.0),
        finding("TEST-0003", "minimist", "1.2.5", 7.0),
      ],
    },
  },
  analysis_info: { status: "success" },
};

describe("Vulnerabilities list (e2e)", () => {
  let user: TestUser;
  let url: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@vulns.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Vulnerable project", description: "Has findings" },
    );
    const projectId = project.json().id as string;

    const data = testHelper.getDataSource();
    const analysisId = randomUUID();
    await data.query(
      `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId")
       VALUES ($1, now(), '{}', 'completed', '[]', 'main', $2, $3)`,
      [analysisId, projectId, orgId],
    );
    await data.query(
      `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'vuln-finder', now(), $2)`,
      [JSON.stringify(vulnsOutput), analysisId],
    );
    url = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}/vulnerabilities?workspace=.`;
  });

  const dependencies = async (query: string): Promise<string[]> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${url}&${query}`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return (
      response.json().data as { Affected: { AffectedDependency: string }[] }[]
    ).map((v) => v.Affected[0]!.AffectedDependency);
  };

  it("sorts by dependency name from A to Z", async () => {
    expect(await dependencies("sort_by=dep_name&sort_direction=ASC")).toEqual([
      "axios",
      "lodash",
      "minimist",
    ]);
  });

  it("sorts by dependency name from Z to A", async () => {
    expect(await dependencies("sort_by=dep_name&sort_direction=DESC")).toEqual([
      "minimist",
      "lodash",
      "axios",
    ]);
  });

  it("finds findings by installed version", async () => {
    expect(await dependencies("search_key=4.17.20")).toEqual(["lodash"]);
  });

  it("ignores spaces around the search", async () => {
    expect(
      await dependencies(`search_key=${encodeURIComponent("  axios ")}`),
    ).toEqual(["axios"]);
  });
});
