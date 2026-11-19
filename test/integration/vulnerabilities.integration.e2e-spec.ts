import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { NVDRepository } from "../../src/codeclarity_modules/knowledge/nvd/nvd.repository";
import { OSVRepository } from "../../src/codeclarity_modules/knowledge/osv/osv.repository";
import { PackageRepository } from "../../src/codeclarity_modules/knowledge/package/package.repository";
import { NVDReportGenerator } from "../../src/codeclarity_modules/results/vulnerabilities/services/reportGenerator";
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

// One app for the file: a second setup would register its metrics twice.
beforeAll(async () => {
  await testHelper.setupTestApp();
});

afterAll(async () => {
  await testHelper.teardownTestApp();
});

describe("Vulnerabilities list (e2e)", () => {
  let user: TestUser;
  let url: string;
  let analysisId: string;

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

  describe("uncorroborated vulnerability instances", () => {
    const verdicts = (osv: string, nvd: string, gcve: string) => [
      { source: "osv", verdict: osv },
      { source: "nvd", verdict: nvd },
      { source: "gcve", verdict: gcve },
    ];
    // A GCVE-only match, an NVD and GCVE pair, a corroborated match and an older result.
    const labelled = {
      workspaces: {
        ".": {
          Vulnerabilities: [
            {
              ...finding("CVE-2099-0001", "qs", "6.0.0", 9.0),
              Sources: ["GCVE"],
              NVDMatch: { Vulnerability: null },
              SourceVerdicts: verdicts(
                "no_package_data",
                "no_record",
                "matched",
              ),
            },
            {
              ...finding("TEST-0006", "ms", "2.0.0", 8.0),
              Sources: ["NVD", "GCVE"],
              SourceVerdicts: verdicts("no_record", "matched", "matched"),
            },
            {
              ...finding("TEST-0007", "debug", "2.6.8", 7.0),
              Sources: ["NVD", "OSV"],
              SourceVerdicts: verdicts("matched", "matched", "no_record"),
            },
            finding("TEST-0008", "minimist", "1.2.5", 6.0),
          ],
        },
      },
      analysis_info: { status: "success" },
    };

    interface Labelled {
      Vulnerability: string;
      Uncorroborated?: boolean;
      Conflict: { ConflictFlag: string };
      Affected: { Uncorroborated?: boolean; SourceVerdicts?: unknown[] }[];
    }

    const list = async (query: string) => {
      await testHelper
        .getDataSource()
        .query(
          `UPDATE result SET result = $1 WHERE plugin = 'vuln-finder' AND "analysisId" = $2`,
          [JSON.stringify(labelled), analysisId],
        );
      const response = await testHelper.makeAuthenticatedRequest(
        "GET",
        `${url}&sort_by=severity&sort_direction=DESC&${query}`,
        user.accessToken,
      );
      expect(response.statusCode).toBe(200);
      return response.json() as {
        data: Labelled[];
        total_entries: number;
        filter_count: Record<string, number>;
      };
    };

    it("labels instances matched by one source origin only, and keeps them listed", async () => {
      const { data, total_entries } = await list("");

      expect(total_entries).toBe(4);
      expect(data.map((v) => [v.Vulnerability, v.Uncorroborated])).toEqual([
        ["CVE-2099-0001", true],
        ["TEST-0006", true],
        ["TEST-0007", false],
        ["TEST-0008", false],
      ]);
      expect(data[0]!.Affected[0]!.Uncorroborated).toBe(true);
    });

    it("sends each source's verdict for the hover", async () => {
      const { data } = await list("");

      expect(data[0]!.Affected[0]!.SourceVerdicts).toEqual(
        verdicts("no_package_data", "no_record", "matched"),
      );
      expect(data[3]!.Affected[0]!.SourceVerdicts).toBeUndefined();
    });

    it("no longer marks a CVE with an NVD match as possibly incorrect", async () => {
      const { data } = await list("");

      expect(data[0]!.Conflict.ConflictFlag).toBe("NO_CONFLICT");
    });

    it("hides and counts uncorroborated instances by filter", async () => {
      const { data, filter_count } = await list(
        "active_filters=[hide_uncorroborated]",
      );

      expect(data.map((v) => v.Vulnerability)).toEqual([
        "TEST-0007",
        "TEST-0008",
      ]);
      expect(filter_count.hide_uncorroborated).toBe(2);
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

const sbomDependency = {
  Key: "",
  Requires: {},
  Dependencies: {},
  Optional: false,
  Bundled: false,
  Dev: false,
  Prod: true,
  Direct: true,
  Transitive: false,
  Licenses: [],
};

const sbomOutput = {
  workspaces: {
    ".": {
      dependencies: {
        lodash: { "4.17.20": sbomDependency },
        axios: { "0.21.1": sbomDependency },
        minimist: { "1.2.5": sbomDependency },
      },
      start: { dependencies: [], dev_dependencies: [] },
    },
  },
  analysis_info: { status: "success", package_manager: "NPM" },
};

describe("Vulnerability stats with a policy exclusion (e2e)", () => {
  let user: TestUser;
  let base: string;

  // A previous scan with the same findings, and the current one with a policy excluding axios's TEST-0002.
  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@vuln-policy.com",
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
      name: "Policy project",
      description: "Has an excluded finding",
    });
    const analyzerId = await request("/analyzers", {
      name: "Policy analyzer",
      description: "Runs vuln-finder",
      steps: [[{ name: "js-sbom", version: "1.0.0", config: {} }]],
    });
    const policyId = await request("/policies/vulnerability_policy", {
      name: "Accepted risks",
      description: "",
      type: "BLACKLIST",
      vulnerabilities: ["TEST-0002"],
      default: false,
    });

    const data = testHelper.getDataSource();
    const seedAnalysis = async (age: string, config: object) => {
      const id = randomUUID();
      await data.query(
        `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId", "analyzerId")
         VALUES ($1, now() - $2::interval, $3, 'completed', '[]', 'main', $4, $5, $6)`,
        [id, age, JSON.stringify(config), projectId, orgId, analyzerId],
      );
      for (const [plugin, result] of [
        ["js-sbom", sbomOutput],
        ["vuln-finder", vulnsOutput],
      ] as const) {
        await data.query(
          `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, now(), $3)`,
          [JSON.stringify(result), plugin, id],
        );
      }
      return id;
    };
    await seedAnalysis("1 day", {});
    const analysisId = await seedAnalysis("0 seconds", {
      "vuln-finder": { vulnerabilityPolicy: [policyId] },
    });
    base = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}/vulnerabilities`;
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

  const counts = async (query: string) => {
    const stats = (await get(`${base}/stats?workspace=.${query}`))[
      "data"
    ] as Record<string, number>;
    const list = await get(`${base}?workspace=.${query}`);
    return {
      vulnerabilities: stats["number_of_vulnerabilities"],
      critical: stats["number_of_critical"],
      vulnerabilitiesDiff: stats["number_of_vulnerabilities_diff"],
      criticalDiff: stats["number_of_critical_diff"],
      listTotal: list["total_entries"],
    };
  };

  it("leaves the excluded vulnerability out of the stats and the list", async () => {
    expect(await counts("")).toEqual({
      vulnerabilities: 2,
      critical: 0,
      vulnerabilitiesDiff: 0,
      criticalDiff: 0,
      listTotal: 2,
    });
  });

  it("counts the excluded vulnerability when asked to show it", async () => {
    expect(await counts("&show_blacklisted=true")).toEqual({
      vulnerabilities: 3,
      critical: 1,
      vulnerabilitiesDiff: 0,
      criticalDiff: 0,
      listTotal: 3,
    });
  });
});

// An SBOM entry for one installed version.
const sbomEntry = (name: string, version: string) => ({
  [name]: {
    [version]: {
      Key: `${name}@${version}`,
      Requires: {},
      Dependencies: {},
      Optional: false,
      Bundled: false,
      Dev: false,
      Prod: true,
      Direct: true,
      Transitive: false,
      Licenses: ["MIT"],
    },
  },
});

const sbomWorkspace = (name: string, version: string) => ({
  dependencies: sbomEntry(name, version),
  start: { dependencies: [{ name, version, constraint: version }] },
});

// The root and packages/app install different lodash versions with their own findings.
// packages/docs has an SBOM but no vuln-finder workspace.
const multiWorkspaceSbom = {
  workspaces: {
    ".": sbomWorkspace("lodash", "4.17.20"),
    "packages/app": sbomWorkspace("lodash", "4.17.21"),
    "packages/docs": sbomWorkspace("lodash", "4.17.21"),
  },
  analysis_info: {
    status: "success",
    project_name: "sample",
    package_manager: "NPM",
  },
};

const multiWorkspaceVulns = {
  workspaces: {
    ".": { Vulnerabilities: [finding("TEST-0001", "lodash", "4.17.20", 5.0)] },
    "packages/app": {
      Vulnerabilities: [
        finding("TEST-0101", "lodash", "4.17.21", 6.0),
        finding("TEST-0102", "lodash", "4.17.21", 4.0),
      ],
    },
  },
  analysis_info: { status: "success" },
};

describe("Vulnerability details and dependencies of a workspace (e2e)", () => {
  let user: TestUser;
  let analysisUrl: string;
  let genReport: jest.SpyInstance;

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@workspaces.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Monorepo", description: "Has workspaces" },
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
      ["vuln-finder", multiWorkspaceVulns],
      ["js-sbom", multiWorkspaceSbom],
    ] as const) {
      await data.query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, $2, now(), $3)`,
        [JSON.stringify(output), plugin, analysisId],
      );
    }
    analysisUrl = `/org/${orgId}/projects/${projectId}/analysis/${analysisId}`;

    // Knowledge records are stubbed: these tests are about the workspace only.
    const app = testHelper.getApp();
    jest
      .spyOn(app.get(NVDRepository), "getVulnWithoutFailing")
      .mockResolvedValue({ cve_id: "stub" } as never);
    jest
      .spyOn(app.get(OSVRepository), "getVulnByOSVIDWithoutFailing")
      .mockResolvedValue(null);
    jest
      .spyOn(app.get(PackageRepository), "getVersionInfo")
      .mockRejectedValue(new Error("not in knowledge"));
    genReport = jest
      .spyOn(app.get(NVDReportGenerator), "genReport")
      .mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const get = (path: string) =>
    testHelper.makeAuthenticatedRequest(
      "GET",
      `${analysisUrl}${path}`,
      user.accessToken,
    );

  it("builds the detail from the selected workspace's finding and dependency", async () => {
    const response = await get(
      "/vulnerabilities/vulnerability/TEST-0101?workspace=packages/app",
    );

    expect(response.statusCode).toBe(200);
    const [finding, , dependency] = genReport.mock.calls[0] as [
      { VulnerabilityId: string; AffectedVersion: string },
      string,
      { Key: string },
    ];
    expect(finding.VulnerabilityId).toBe("TEST-0101");
    expect(finding.AffectedVersion).toBe("4.17.21");
    expect(dependency.Key).toBe("lodash@4.17.21");
  });

  it("does not find another workspace's finding", async () => {
    const response = await get(
      "/vulnerabilities/vulnerability/TEST-0101?workspace=.",
    );

    expect(response.statusCode).toBe(404);
    expect(genReport).not.toHaveBeenCalled();
  });

  it("rejects a detail request for an unknown workspace", async () => {
    const response = await get(
      "/vulnerabilities/vulnerability/TEST-0101?workspace=packages/missing",
    );

    expect(response.statusCode).toBe(404);
    expect(response.json()["error_code"]).toBe("UnknownWorkspace");
  });

  const dependencyOf = (workspace: string, dependency: string) =>
    get(
      `/sbom/dependency?workspace=${encodeURIComponent(workspace)}&dependency=${encodeURIComponent(dependency)}`,
    );

  it("lists the selected workspace's findings on a dependency", async () => {
    const response = await dependencyOf("packages/app", "lodash@4.17.21");

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: { vulnerabilities: string[]; severity_dist: { medium: number } };
    };
    expect(body.data.vulnerabilities).toEqual(["TEST-0101", "TEST-0102"]);
    expect(body.data.severity_dist.medium).toBe(2);
  });

  it("lists the root workspace's findings on its own dependency", async () => {
    const response = await dependencyOf(".", "lodash@4.17.20");

    expect(response.statusCode).toBe(200);
    expect(response.json().data.vulnerabilities).toEqual(["TEST-0001"]);
  });

  it("rejects a dependency request for an unknown workspace", async () => {
    const response = await dependencyOf("packages/missing", "lodash@4.17.21");

    expect(response.statusCode).toBe(404);
    expect(response.json()["error_code"]).toBe("UnknownWorkspace");
  });

  it("rejects a workspace the vulnerability results do not have", async () => {
    const response = await dependencyOf("packages/docs", "lodash@4.17.21");

    expect(response.statusCode).toBe(404);
    expect(response.json()["error_code"]).toBe("UnknownWorkspace");
  });
});
