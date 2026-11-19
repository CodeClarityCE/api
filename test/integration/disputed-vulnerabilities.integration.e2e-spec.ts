import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

// Ids are neither CVE nor GHSA so no knowledge lookups run.
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
    SeverityType: "CVSS_V31",
    Vector: "",
    ConfidentialityImpact: "NONE",
    IntegrityImpact: "NONE",
    AvailabilityImpact: "NONE",
  },
  Conflict: { ConflictWinner: "NVD", ConflictFlag: "NO_CONFLICT" },
});

// A vendor-disputed critical on lodash, an undisputed high on axios and a medium on minimist.
const vulnsOutput = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        { ...finding("TEST-0001", "lodash", "4.17.20", 9.8), Disputed: true },
        finding("TEST-0002", "axios", "0.21.1", 7.5),
        finding("TEST-0003", "minimist", "1.2.5", 5.0),
      ],
    },
  },
  analysis_info: { status: "success" },
};

const dependency = () => ({
  Licenses: [],
  Prod: true,
  Direct: true,
  Transitive: false,
});

const sbomOutput = {
  workspaces: {
    ".": {
      dependencies: {
        lodash: { "4.17.20": dependency() },
        axios: { "0.21.1": dependency() },
        minimist: { "1.2.5": dependency() },
      },
      start: { dependencies: [], dev_dependencies: [] },
    },
  },
  analysis_info: { status: "success", package_manager: "NPM" },
};

describe("Disputed vulnerabilities (e2e)", () => {
  let user: TestUser;
  let base: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@disputed.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Disputed project", description: "Has a disputed CVE" },
    );
    const projectId = project.json().id as string;

    const data = testHelper.getDataSource();
    const analysisId = randomUUID();
    await data.query(
      `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId")
       VALUES ($1, now(), '{}', 'completed', '[]', 'main', $2, $3)`,
      [analysisId, projectId, orgId],
    );
    for (const [plugin, output] of [
      ["js-sbom", sbomOutput],
      ["vuln-finder", vulnsOutput],
    ] as const) {
      await data.query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, now(), $3)`,
        [JSON.stringify(output), plugin, analysisId],
      );
    }
    base = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}`;
  });

  const get = async (path: string): Promise<unknown> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/${path}?workspace=.`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data?: unknown };
    return body.data ?? body;
  };

  it("keeps a disputed vulnerability in the list and marks it disputed", async () => {
    const list = (await get("vulnerabilities")) as {
      Vulnerability: string;
      Disputed?: boolean;
      Affected: { Disputed?: boolean }[];
    }[];

    const byId = Object.fromEntries(list.map((v) => [v.Vulnerability, v]));
    expect(Object.keys(byId).sort()).toEqual([
      "TEST-0001",
      "TEST-0002",
      "TEST-0003",
    ]);
    expect(byId["TEST-0001"]!.Disputed).toBe(true);
    expect(byId["TEST-0001"]!.Affected[0]!.Disputed).toBe(true);
    expect(byId["TEST-0002"]!.Disputed).toBeFalsy();
    expect(byId["TEST-0002"]!.Affected[0]!.Disputed).toBeFalsy();
  });

  it("counts a disputed vulnerability by severity but leaves it out of the grade inputs", async () => {
    const stats = (await get("vulnerabilities/stats")) as Record<
      string,
      number
    >;

    expect({
      vulnerabilities: stats["number_of_vulnerabilities"],
      critical: stats["number_of_critical"],
      high: stats["number_of_high"],
      disputed: stats["number_of_disputed"],
      gradedVulnerabilities: stats["graded_number_of_vulnerabilities"],
      gradedCritical: stats["graded_number_of_critical"],
      gradedHigh: stats["graded_number_of_high"],
    }).toEqual({
      vulnerabilities: 3,
      critical: 1,
      high: 1,
      disputed: 1,
      gradedVulnerabilities: 2,
      gradedCritical: 0,
      gradedHigh: 1,
    });
  });
});
