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
    SeverityClass: "",
    SeverityType: "CVSS_V31",
    Vector: "CVSS:3.1/AV:N",
    Impact: 0,
    Exploitability: 0,
    ConfidentialityImpact: "HIGH",
    IntegrityImpact: "LOW",
    AvailabilityImpact: "NONE",
    ConfidentialityImpactNumerical: 0,
    IntegrityImpactNumerical: 0,
    AvailabilityImpactNumerical: 0,
  },
  Conflict: { ConflictWinner: "NVD", ConflictFlag: "NO_CONFLICT" },
});

const vulnsOutput = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        finding("TEST-0001", "lodash", "4.17.20", 7.0),
        finding("TEST-0002", "axios", "0.21.1", 9.0),
        finding("TEST-0003", "minimist", "1.2.5", 5.0),
      ],
    },
  },
  analysis_info: { status: "success" },
};

const dependency = (direct: boolean) => ({
  Key: "",
  Requires: {},
  Dependencies: {},
  Optional: false,
  Bundled: false,
  Dev: false,
  Prod: true,
  Direct: direct,
  Transitive: !direct,
  Licenses: [],
});

const sbomOutput = {
  workspaces: {
    ".": {
      dependencies: {
        lodash: { "4.17.20": dependency(true) },
        axios: { "0.21.1": dependency(true) },
        minimist: { "1.2.5": dependency(false) },
      },
      start: { dependencies: [], dev_dependencies: [] },
    },
  },
  analysis_info: { status: "success", package_manager: "NPM" },
};

const toPatch = (id: string, dependency: string, version: string) => ({
  DependencyName: dependency,
  DependencyVersion: version,
  Path: [],
  Vulnerability: {
    VulnerabilityId: id,
    AffectedDependency: dependency,
    AffectedVersion: version,
    Severity: {
      Severity: 6.1,
      SeverityType: "CVSS_V31",
      Vector: "CVSS:3.1/AV:N",
      ConfidentialityImpact: "LOW",
      IntegrityImpact: "LOW",
      AvailabilityImpact: "NONE",
    },
  },
});

// lodash is fixed, axios is not, and the lodash upgrade brings in a new vulnerability.
const patchingOutput = {
  workspaces: {
    ".": {
      patches: {
        "lodash@4.17.20": {
          IsPatchable: "FULL",
          Patchable: [toPatch("TEST-0001", "lodash", "4.17.20")],
          Unpatchable: [],
          Introduced: [toPatch("TEST-0004", "debug", "4.0.0")],
        },
        "axios@0.21.1": {
          IsPatchable: "NONE",
          Patchable: [],
          Unpatchable: [toPatch("TEST-0002", "axios", "0.21.1")],
          Introduced: [],
        },
      },
      dev_patches: {},
    },
  },
  analysis_info: { status: "success", private_errors: [], public_errors: [] },
};

describe("Patching stats (e2e)", () => {
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
      email: "admin@patching.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Patched project", description: "Has patches" },
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
      ["js-patching", patchingOutput],
    ] as const) {
      await data.query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, now(), $3)`,
        [JSON.stringify(output), plugin, analysisId],
      );
    }
    base = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}`;
  });

  const get = async (path: string): Promise<Record<string, number>> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/${path}?workspace=.`,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data?: Record<string, number> };
    return body.data ?? (body as Record<string, number>);
  };

  it("counts before like the vulnerabilities tab, and after the upgrades", async () => {
    const tab = await get("vulnerabilities/stats");
    const stats = await get("patching/stats");

    for (const field of [
      "number_of_issues",
      "number_of_vulnerabilities",
      "number_of_vulnerable_dependencies",
      "number_of_direct_vulnerabilities",
      "number_of_transitive_vulnerabilities",
      "mean_severity",
      "max_severity",
      "number_of_critical",
      "number_of_high",
      "number_of_medium",
      "number_of_low",
      "number_of_none",
    ]) {
      expect([field, stats[`before_patch_${field}`]]).toEqual([
        field,
        tab[field],
      ]);
    }
    expect(stats["before_patch_overall_confidentiality_impact"]).toBe(
      tab["mean_confidentiality_impact"],
    );

    // lodash fixed, axios and minimist kept, debug introduced.
    expect(stats["before_patch_number_of_issues"]).toBe(3);
    expect(stats["after_patch_number_of_issues"]).toBe(3);
    expect(stats["after_patch_number_of_direct_vulnerabilities"]).toBe(1);
    expect(stats["after_patch_number_of_high"]).toBe(0);
    expect(stats["after_patch_number_of_medium"]).toBe(2);
    expect(stats["after_patch_max_severity"]).toBe(9);
  });
});
