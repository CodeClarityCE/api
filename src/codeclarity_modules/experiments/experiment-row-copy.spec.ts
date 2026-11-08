import {
  isUsablePluginResult,
  mapRunRows,
  unwrapResultEnvelope,
} from "./experiment-row-copy";

/** An SBOM dependency entry carrying only the flags the mapper reads. */
function dep(flags: {
  Direct?: boolean;
  Transitive?: boolean;
  Dev?: boolean;
  Prod?: boolean;
}): Record<string, unknown> {
  return {
    Direct: false,
    Transitive: false,
    Dev: false,
    Prod: false,
    Optional: false,
    Bundled: false,
    ...flags,
  };
}

function sbom(
  workspaces: Record<string, Record<string, Record<string, unknown>>>,
  packageManager = "YARN",
): unknown {
  return {
    workspaces: Object.fromEntries(
      Object.entries(workspaces).map(([ws, dependencies]) => [
        ws,
        { dependencies, start: {} },
      ]),
    ),
    analysis_info: { status: "success", package_manager: packageManager },
  };
}

function vulnFinder(workspaces: Record<string, unknown[]>): unknown {
  return {
    workspaces: Object.fromEntries(
      Object.entries(workspaces).map(([ws, vulns]) => [
        ws,
        { Vulnerabilities: vulns },
      ]),
    ),
    analysis_info: { status: "success" },
  };
}

/** A vulnerability instance as vuln-finder writes it, overridable per field. */
function instance(overrides: Record<string, unknown> = {}): unknown {
  return {
    VulnerabilityId: "CVE-2021-23337",
    AffectedDependency: "lodash",
    AffectedVersion: "4.17.20",
    Severity: {
      Severity: 7.2,
      SeverityClass: "HIGH",
      Vector: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H",
      Impact: 5.9,
      Exploitability: 1.2,
    },
    EPSS: { Score: 0.024, Percentile: 0.854 },
    Conflict: { ConflictFlag: "MATCH_CORRECT", ConflictWinner: "OSV" },
    OSVMatch: {
      Vulnerability: {
        published: "2021-02-15T13:15:00Z",
        modified: "2024-01-01T00:00:00Z",
        withdrawn: "",
      },
    },
    NVDMatch: { Vulnerability: null },
    GCVEMatch: { Vulnerability: null },
    ...overrides,
  };
}

const EMPTY_SBOM = sbom({ ".": {} });

describe("mapRunRows", () => {
  it("counts every (workspace, package, version) entry of a multi-workspace SBOM, flags not exclusive", () => {
    const rows = mapRunRows(
      sbom({
        ".": {
          lodash: {
            "4.17.21": dep({ Direct: true, Prod: true }),
            "3.10.1": dep({ Transitive: true, Dev: true }),
          },
          react: {
            "18.3.1": dep({ Direct: true, Transitive: true, Prod: true }),
          },
        },
        "tools/cli": {
          lodash: { "4.17.21": dep({ Direct: true, Dev: true, Prod: true }) },
          chalk: { "5.3.0": dep({}) },
        },
      }),
      vulnFinder({ ".": [], "tools/cli": [] }),
    );

    expect(rows.summary).toMatchObject({
      total_dependencies: 5,
      direct_dependencies: 3,
      transitive_dependencies: 2,
      dev_dependencies: 2,
      prod_dependencies: 3,
      package_manager: "YARN",
    });
  });

  it("copies one row per vulnerability instance, keyed by its workspace", () => {
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [instance()],
        "tests/kit": [
          instance({ AffectedVersion: "4.17.11" }),
          instance({
            VulnerabilityId: "GHSA-xxxx",
            AffectedDependency: "minimist",
            AffectedVersion: "1.2.5",
          }),
        ],
      }),
    );

    expect(rows.vulnerabilities).toEqual([
      {
        workspace: ".",
        vulnerability_id: "CVE-2021-23337",
        affected_dependency: "lodash",
        affected_version: "4.17.20",
        severity_class: "HIGH",
        severity_score: 7.2,
        severity_vector: "CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H",
        impact: 5.9,
        exploitability: 1.2,
        epss_score: 0.024,
        epss_percentile: 0.854,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        direct_dependency: false,
        published_date: "2021-02-15T13:15:00Z",
        modified_date: "2024-01-01T00:00:00Z",
        withdrawn_date: null,
        vulnerable_versions: null,
      },
      expect.objectContaining({
        workspace: "tests/kit",
        affected_version: "4.17.11",
      }),
      expect.objectContaining({
        workspace: "tests/kit",
        vulnerability_id: "GHSA-xxxx",
        affected_dependency: "minimist",
      }),
    ]);
    expect(rows.summary).toMatchObject({
      total_vulnerabilities: 3,
      vulnerable_dependencies: 2,
    });
  });

  it("keeps the affected versions of every source that matched, so other versions can be tested later", () => {
    const semver = (
      Major: number,
      Minor: number,
      Patch: number,
      PreReleaseTag = "",
    ): object => ({
      Major,
      Minor,
      Patch,
      PreReleaseTag,
      MetaData: "",
      IsDev: false,
      DevBranch: "",
      Stability: "",
    });
    const zero = semver(0, 0, 0);
    const noUniversal = {
      CPEInfo: { criteria: "", criteriaDict: { part: "" }, vulnerable: false },
    };
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [
          instance({
            OSVMatch: {
              Vulnerable: true,
              Vulnerability: { published: "2021-02-15T13:15:00Z" },
              AffectedInfo: [
                {
                  Exact: null,
                  Ranges: [
                    { IntroducedSemver: zero, FixedSemver: semver(4, 17, 21) },
                  ],
                  Universal: noUniversal,
                },
              ],
            },
            NVDMatch: {
              Vulnerable: true,
              Vulnerability: null,
              AffectedInfo: [
                {
                  Exact: [{ VersionString: "4.17.22-beta.1" }],
                  Ranges: [
                    { IntroducedSemver: semver(5, 0, 0), FixedSemver: zero },
                  ],
                  Universal: noUniversal,
                },
              ],
            },
            GCVEMatch: {
              Vulnerable: false,
              Vulnerability: null,
              AffectedInfo: [
                {
                  Exact: null,
                  Ranges: [
                    { IntroducedSemver: zero, FixedSemver: semver(9, 0, 0) },
                  ],
                  Universal: noUniversal,
                },
              ],
            },
          }),
          instance({
            OSVMatch: {
              Vulnerable: true,
              Vulnerability: null,
              AffectedInfo: [
                {
                  Exact: null,
                  Ranges: null,
                  Universal: { CPEInfo: { criteria: "cpe:2.3:a:x:lodash:*" } },
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(rows.vulnerabilities.map((v) => v.vulnerable_versions)).toEqual([
      {
        ranges: [
          { introduced: null, fixed: "4.17.21" },
          { introduced: "5.0.0", fixed: null },
        ],
        exact: ["4.17.22-beta.1"],
        universal: false,
      },
      { ranges: [], exact: [], universal: true },
    ]);
  });

  it("takes disclosure dates from NVD, then OSV, then GCVE, and keeps OSV withdrawals", () => {
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [
          instance({
            NVDMatch: {
              Vulnerability: {
                Published: "2021-02-15T13:15:12.560",
                LastModified: "",
              },
            },
            OSVMatch: {
              Vulnerability: {
                published: "2021-02-16T00:00:00Z",
                modified: "2024-01-01T00:00:00Z",
                withdrawn: "2024-06-01T00:00:00Z",
              },
            },
          }),
          instance({
            OSVMatch: null,
            GCVEMatch: {
              Vulnerability: {
                datePublished: "2022-03-01T00:00:00Z",
                dateUpdated: "2022-04-01T00:00:00Z",
              },
            },
          }),
        ],
      }),
    );

    expect(rows.vulnerabilities[0]).toMatchObject({
      published_date: "2021-02-15T13:15:12.560",
      modified_date: "2024-01-01T00:00:00Z",
      withdrawn_date: "2024-06-01T00:00:00Z",
    });
    expect(rows.vulnerabilities[1]).toMatchObject({
      published_date: "2022-03-01T00:00:00Z",
      modified_date: "2022-04-01T00:00:00Z",
      withdrawn_date: null,
    });
  });

  it("buckets instances by severity class, NONE included and a missing class in no bucket", () => {
    const withClass = (SeverityClass: unknown): unknown =>
      instance({ Severity: { Severity: 1, SeverityClass } });
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [
          withClass("CRITICAL"),
          withClass("HIGH"),
          withClass("HIGH"),
          withClass("Medium"),
          withClass("LOW"),
          withClass("NONE"),
          withClass("NONE"),
          withClass(null),
        ],
        "tools/cli": [withClass("NONE")],
      }),
    );

    expect(rows.summary).toMatchObject({
      total_vulnerabilities: 9,
      n_critical: 1,
      n_high: 2,
      n_medium: 1,
      n_low: 1,
      n_none: 3,
    });
    expect(rows.vulnerabilities[7]?.severity_class).toBeNull();
  });

  it("splits instances into direct and transitive by vuln-finder's direct_dependency flag", () => {
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [instance({ direct_dependency: true }), instance()],
        "tools/cli": [instance({ direct_dependency: true }), instance()],
        "tests/kit": [instance()],
      }),
    );

    expect(rows.summary).toMatchObject({
      total_vulnerabilities: 5,
      direct_vulnerabilities: 2,
      transitive_vulnerabilities: 3,
    });
    expect(rows.vulnerabilities.map((v) => v.direct_dependency)).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
  });

  it("leaves EPSS empty when the instance has none", () => {
    const rows = mapRunRows(
      EMPTY_SBOM,
      vulnFinder({
        ".": [instance({ EPSS: undefined }), instance({ EPSS: null })],
      }),
    );

    for (const row of rows.vulnerabilities) {
      expect(row).toMatchObject({ epss_score: null, epss_percentile: null });
    }
  });
});

describe("isUsablePluginResult", () => {
  it("accepts a successful plugin result with workspaces", () => {
    expect(isUsablePluginResult(EMPTY_SBOM)).toBe(true);
    expect(isUsablePluginResult(vulnFinder({}))).toBe(true);
  });

  it.each([
    ["missing", null],
    ["not an object", '{"workspaces": {}}'],
    ["without workspaces", { analysis_info: { status: "success" } }],
    [
      "from a failed plugin",
      { workspaces: {}, analysis_info: { status: "failure" } },
    ],
  ])("rejects a result that is %s", (_, blob) => {
    expect(isUsablePluginResult(blob)).toBe(false);
  });
});

describe("unwrapResultEnvelope", () => {
  it("unwraps a Result entity as the results endpoint returns it, once", () => {
    const payload = sbom({ ".": {} });
    expect(
      unwrapResultEnvelope({
        result: payload,
        plugin: "js-sbom",
        created_on: "2026-08-30T16:03:28Z",
      }),
    ).toBe(payload);
    expect(unwrapResultEnvelope(payload)).toBe(payload);
  });
});
