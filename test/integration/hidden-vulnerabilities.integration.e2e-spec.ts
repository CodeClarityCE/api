import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

type Verdicts = { source: string; verdict: string }[];

// Ids are neither CVE nor GHSA so no knowledge lookups run.
const finding = (
  id: string,
  dependency: string,
  score: number,
  verdicts?: Verdicts,
) => ({
  Id: id,
  Sources: ["GCVE"],
  AffectedDependency: dependency,
  AffectedVersion: "1.0.0",
  VulnerabilityId: id,
  Severity: {
    Severity: score,
    SeverityType: "CVSS_V31",
    Vector: "",
    ConfidentialityImpact: "NONE",
    IntegrityImpact: "NONE",
    AvailabilityImpact: "NONE",
  },
  Conflict: { ConflictWinner: "GCVE", ConflictFlag: "NO_CONFLICT" },
  ...(verdicts ? { SourceVerdicts: verdicts } : {}),
});

const v = (gcve: string, nvd: string, osv: string): Verdicts => [
  { source: "gcve", verdict: gcve },
  { source: "nvd", verdict: nvd },
  { source: "osv", verdict: osv },
];

// Two contradicted criticals, one instance retired everywhere, and two visible ones.
const withVerdicts = [
  finding(
    "TEST-0001",
    "lodash",
    9.8,
    v("matched", "no_record", "version_excluded"),
  ),
  finding("TEST-0002", "axios", 9.1, v("matched", "matched", "retired")),
  finding(
    "TEST-0003",
    "minimist",
    5.0,
    v("version_excluded", "matched", "no_record"),
  ),
  finding("TEST-0004", "qs", 7.5, v("retired", "retired", "retired")),
  finding(
    "TEST-0005",
    "express",
    7.5,
    v("version_excluded", "matched", "matched"),
  ),
];
const withoutVerdicts = withVerdicts.map((f) => {
  const { SourceVerdicts: _dropped, ...rest } = f;
  return rest;
});

const output = (vulnerabilities: object[]) => ({
  workspaces: { ".": { Vulnerabilities: vulnerabilities } },
  analysis_info: { status: "success" },
});

const dependency = () => ({
  Licenses: [],
  Prod: true,
  Direct: true,
  Transitive: false,
});

const sbomOutput = {
  workspaces: {
    ".": {
      dependencies: Object.fromEntries(
        withVerdicts.map((f) => [
          f.AffectedDependency,
          { "1.0.0": dependency() },
        ]),
      ),
      start: { dependencies: [], dev_dependencies: [] },
    },
  },
  analysis_info: { status: "success", package_manager: "NPM" },
};

interface ListEntry {
  Vulnerability: string;
  Affected: { Hidden?: string; ContradictedBy?: string[] }[];
}

describe("Hidden vulnerability instances (e2e)", () => {
  let user: TestUser;
  let current: string;
  let older: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  // An analysis made before source verdicts, then one with them, both of the same project.
  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@hidden.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const request = async (path: string, body: object) =>
      (
        await testHelper.makeAuthenticatedRequest(
          "POST",
          `/org/${orgId}${path}`,
          user.accessToken,
          body,
        )
      ).json().id as string;
    const projectId = await request("/projects", {
      name: "Hidden project",
      description: "Has contradicted findings",
    });
    const analyzerId = await request("/analyzers", {
      name: "Hidden analyzer",
      description: "Runs vuln-finder",
      steps: [[{ name: "js-sbom", version: "1.0.0", config: {} }]],
    });

    const data = testHelper.getDataSource();
    const seed = async (age: string, vulns: object[]) => {
      const id = randomUUID();
      await data.query(
        `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId", "analyzerId")
         VALUES ($1, now() - $2::interval, '{}', 'completed', '[]', 'main', $3, $4, $5)`,
        [id, age, projectId, orgId, analyzerId],
      );
      for (const [plugin, result] of [
        ["js-sbom", sbomOutput],
        ["vuln-finder", output(vulns)],
      ] as const) {
        await data.query(
          `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, now(), $3)`,
          [JSON.stringify(result), plugin, id],
        );
      }
      return `/org/${orgId}/projects/${projectId}/analysis/${id}/vulnerabilities`;
    };
    older = await seed("2 days", withoutVerdicts);
    await seed("1 day", withVerdicts);
    current = await seed("0 seconds", withVerdicts);
  });

  const get = async (path: string): Promise<Record<string, unknown>> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      path,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    return response.json() as Record<string, unknown>;
  };
  const list = (base: string, query = "") =>
    get(`${base}?workspace=.&entries_per_page=100${query}`);
  const stats = async (base: string, query = "") =>
    (await get(`${base}/stats?workspace=.${query}`))["data"] as Record<
      string,
      unknown
    >;
  const ids = (response: Record<string, unknown>) =>
    (response["data"] as ListEntry[]).map((e) => e.Vulnerability).sort();

  it("hides contradicted and all-retired instances from the list and counts them by reason", async () => {
    const response = await list(current);

    expect(ids(response)).toEqual(["TEST-0003", "TEST-0005"]);
    expect(response["hidden_counts"]).toEqual({
      contradicted: 2,
      retired_all: 1,
    });
    expect(response["source_verdicts_available"]).toBe(true);
  });

  it("shows contradicted instances with their reason when asked", async () => {
    const response = await list(current, "&show_contradicted=true");

    expect(ids(response)).toEqual([
      "TEST-0001",
      "TEST-0002",
      "TEST-0003",
      "TEST-0005",
    ]);
    const lodash = (response["data"] as ListEntry[]).find(
      (e) => e.Vulnerability === "TEST-0001",
    )!;
    expect(lodash.Affected[0]).toMatchObject({
      Hidden: "contradicted",
      ContradictedBy: ["osv"],
    });
  });

  it("shows all-retired instances when asked", async () => {
    const response = await list(current, "&show_retired=true");

    expect(ids(response)).toEqual(["TEST-0003", "TEST-0004", "TEST-0005"]);
  });

  it("names the source that contradicted part of a visible instance", async () => {
    const express = ((await list(current))["data"] as ListEntry[]).find(
      (e) => e.Vulnerability === "TEST-0005",
    )!;

    expect(express.Affected[0]!.Hidden).toBeUndefined();
    expect(express.Affected[0]!.ContradictedBy).toEqual(["gcve"]);
  });

  it("leaves hidden instances out of the stats and the grade inputs", async () => {
    const s = await stats(current);

    expect({
      vulnerabilities: s["number_of_vulnerabilities"],
      critical: s["number_of_critical"],
      high: s["number_of_high"],
      gradedCritical: s["graded_number_of_critical"],
      vulnerabilitiesDiff: s["number_of_vulnerabilities_diff"],
      hidden: s["hidden_counts"],
    }).toEqual({
      vulnerabilities: 2,
      critical: 0,
      high: 1,
      gradedCritical: 0,
      vulnerabilitiesDiff: 0,
      hidden: { contradicted: 2, retired_all: 1 },
    });
  });

  it("counts hidden instances in the stats when the filters show them", async () => {
    const s = await stats(current, "&show_contradicted=true&show_retired=true");

    expect(s["number_of_vulnerabilities"]).toBe(5);
    expect(s["number_of_critical"]).toBe(2);
  });

  it("hides nothing in an analysis made before source verdicts", async () => {
    const response = await list(older);
    const s = await stats(older);

    expect(ids(response)).toHaveLength(5);
    expect(response["hidden_counts"]).toEqual({
      contradicted: 0,
      retired_all: 0,
    });
    expect(response["source_verdicts_available"]).toBe(false);
    expect(s["number_of_vulnerabilities"]).toBe(5);
    expect(s["source_verdicts_available"]).toBe(false);
  });
});
