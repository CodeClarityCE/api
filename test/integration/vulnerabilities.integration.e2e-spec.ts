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

// lodash has an empty AI score, axios a real one.
// Stored order matches neither name order nor severity order.
const vulnsOutput = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        {
          ...finding("TEST-0001", "lodash", "4.17.20", 5.0),
          NVDMatch: { Vulnerability: { Vlai_score: "", Vlai_confidence: 0 } },
        },
        {
          ...finding("TEST-0002", "axios", "0.21.1", 9.0),
          NVDMatch: {
            Vulnerability: { Vlai_score: "high", Vlai_confidence: 0.8 },
          },
        },
        finding("TEST-0003", "minimist", "1.2.5", 7.0),
      ],
    },
  },
  analysis_info: { status: "success" },
};

// A patching result entry, as js-patching writes one per direct dependency.
const toPatch = (id: string, dependency: string, version: string) => ({
  DependencyName: dependency,
  DependencyVersion: version,
  Path: [],
  Vulnerability: {
    VulnerabilityId: id,
    AffectedDependency: dependency,
    AffectedVersion: version,
  },
});

// lodash is fixed by its upgrade, axios by none, minimist through one of two parents.
const patchingOutput = {
  workspaces: {
    ".": {
      patches: {
        "lodash@4.17.20": {
          IsPatchable: "FULL",
          Patchable: [toPatch("TEST-0001", "lodash", "4.17.20")],
          Unpatchable: [],
          Introduced: [],
        },
        "axios@0.21.1": {
          IsPatchable: "NONE",
          Patchable: [],
          Unpatchable: [toPatch("TEST-0002", "axios", "0.21.1")],
          Introduced: [],
        },
        "yargs@15.0.0": {
          IsPatchable: "FULL",
          Patchable: [toPatch("TEST-0003", "minimist", "1.2.5")],
          Unpatchable: [],
          Introduced: [],
        },
      },
      dev_patches: {
        "mocha@8.0.0": {
          IsPatchable: "PARTIAL",
          Patchable: [],
          Unpatchable: [toPatch("TEST-0003", "minimist", "1.2.5")],
          Introduced: [],
        },
      },
    },
  },
  analysis_info: { status: "success" },
};

describe("Vulnerabilities list (e2e)", () => {
  let user: TestUser;
  let url: string;
  let analysisId: string;

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
    analysisId = randomUUID();
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

  interface Affected {
    AffectedDependency: string;
    PatchType?: string;
  }

  const patchTypes = async (): Promise<Record<string, string | undefined>> => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      url,
      user.accessToken,
    );
    expect(response.statusCode).toBe(200);
    const findings = response.json().data as { Affected: Affected[] }[];
    return Object.fromEntries(
      findings
        .flatMap((v) => v.Affected)
        .map((a) => [a.AffectedDependency, a.PatchType]),
    );
  };

  it("shows each dependency's patch status from the patching result", async () => {
    await testHelper
      .getDataSource()
      .query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'js-patching', now(), $2)`,
        [JSON.stringify(patchingOutput), analysisId],
      );

    expect(await patchTypes()).toEqual({
      lodash: "FULL",
      axios: "NONE",
      minimist: "PARTIAL",
    });
  });

  it("filters and counts by patch status", async () => {
    await testHelper
      .getDataSource()
      .query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'js-patching', now(), $2)`,
        [JSON.stringify(patchingOutput), analysisId],
      );

    expect(await dependencies("active_filters=[patch_full]")).toEqual([
      "lodash",
    ]);
    expect(
      (await dependencies("active_filters=[patch_partial,patch_none]")).sort(),
    ).toEqual(["axios", "minimist"]);

    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      url,
      user.accessToken,
    );
    const counts = response.json().filter_count as Record<string, number>;
    expect([
      counts["patch_full"],
      counts["patch_partial"],
      counts["patch_none"],
    ]).toEqual([1, 1, 1]);
  });

  it("finds nothing by patch status when patching did not run", async () => {
    expect(await dependencies("active_filters=[patch_full]")).toEqual([]);
  });

  it("leaves the patch status out when patching did not run", async () => {
    expect(await patchTypes()).toEqual({
      lodash: undefined,
      axios: undefined,
      minimist: undefined,
    });
  });

  describe("a vulnerability found in two versions", () => {
    // qs 6.0.0 is matched by NVD at 4.0, qs 6.5.0 by OSV at 9.5.
    const twoVersions = {
      workspaces: {
        ".": {
          Vulnerabilities: [
            finding("TEST-0004", "qs", "6.0.0", 4.0),
            {
              ...finding("TEST-0004", "qs", "6.5.0", 9.5),
              Sources: ["OSV"],
            },
            finding("TEST-0005", "ms", "2.0.0", 7.0),
          ],
        },
      },
      analysis_info: { status: "success" },
    };

    interface Merged {
      Vulnerability: string;
      Sources: string[];
      Severity: { Severity: number };
    }

    const list = async (query: string): Promise<Merged[]> => {
      await testHelper
        .getDataSource()
        .query(
          `UPDATE result SET result = $1 WHERE plugin = 'vuln-finder' AND "analysisId" = $2`,
          [JSON.stringify(twoVersions), analysisId],
        );
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `${url}&${query}`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      return response.json().data as Merged[];
    };

    it("shows the worst severity of its versions", async () => {
      const findings = await list("sort_by=severity&sort_direction=DESC");

      expect(
        findings.map((v) => [v.Vulnerability, v.Severity.Severity]),
      ).toEqual([
        ["TEST-0004", 9.5],
        ["TEST-0005", 7.0],
      ]);
    });

    it("lists the sources that matched any of its versions", async () => {
      const findings = await list("sort_by=severity&sort_direction=DESC");

      expect(findings[0]!.Sources).toEqual(["NVD", "OSV"]);
    });

    it("filters by the worst severity of its versions", async () => {
      const findings = await list("active_filters=[severity_critical]");

      expect(findings.map((v) => v.Vulnerability)).toEqual(["TEST-0004"]);
    });
  });

  it("sends only the AI assessments that have a score", async () => {
    const response = await testHelper.makeAuthenticatedRequest(
      "GET",
      `${url}&sort_by=dep_name&sort_direction=ASC`,
      user.accessToken,
    );
    const findings = response.json().data as { VLAI: unknown[] }[];

    expect(findings.map((v) => v.VLAI)).toEqual([
      [{ Source: "NVD", Score: "high", Confidence: 0.8 }],
      [],
      [],
    ]);
  });
});
