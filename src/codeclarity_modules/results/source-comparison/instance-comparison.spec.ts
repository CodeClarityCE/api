import { compareAnalysisSources } from "./instance-comparison";
import type {
  AnalysisSourceSnapshot,
  ComparedVulnerability,
  SourceMatch,
} from "./source-match.types";

const healthySnapshot = (
  overrides: Record<string, string> = {},
): AnalysisSourceSnapshot => ({
  taken_at: "2026-11-09T12:00:00Z",
  sources: [
    "cwe",
    "epss",
    "friends_of_php",
    "gcve",
    "licenses",
    "nvd",
    "osv",
  ].map((source) => {
    const status = overrides[source] ?? "healthy";
    return { source, status, comparable: status === "healthy" };
  }),
});

const match = (
  source: string,
  record_id: string,
  overrides: Partial<SourceMatch> = {},
): SourceMatch => ({
  source,
  record_id,
  winning: false,
  affected: { ranges: [{ fixed: "2.0.0" }], exact: [], universal: false },
  evidence: "VULNERABLE_EVIDENCE_RANGE",
  severity: null,
  ...overrides,
});

const vuln = (
  id: string,
  matches?: SourceMatch[],
  dependency = "lodash",
): ComparedVulnerability => ({
  VulnerabilityId: id,
  AffectedDependency: dependency,
  AffectedVersion: "1.0.0",
  ...(matches ? { SourceMatches: matches } : {}),
});

// Origins keyed by record id, as the knowledge DB would answer.
const origins: Record<string, string> = {
  "GHSA-1": "ghsa",
  "GHSA-2": "ghsa",
  "CVE-2024-1": "cve-list",
  "CVE-2024-2": "cve-list",
  "GCVE-0-2024-1": "cve-list",
  "GCVE-1-2024-9": "gcve",
  "FRIENDSOFPHP-a/b/CVE-2024-1": "ghsa",
};
const originOf = (m: SourceMatch): string | undefined => origins[m.record_id];

const compare = (
  vulnerabilities: ComparedVulnerability[],
  options: { snapshot?: AnalysisSourceSnapshot } = {
    snapshot: healthySnapshot(),
  },
) =>
  compareAnalysisSources({
    workspaces: { default: { Vulnerabilities: vulnerabilities } },
    snapshot: options.snapshot,
    originOf,
  });

describe("compareAnalysisSources", () => {
  it("marks an analysis from before stored source matches as not comparable", () => {
    const result = compare([vuln("CVE-2024-1"), vuln("CVE-2024-2")], {});

    expect(result.comparable).toBe(false);
    expect(result.reason).toBe("predates_source_matches");
    expect(result.instances).toEqual({
      total: 2,
      compared: 0,
      malicious_excluded: 0,
      without_source_matches: 2,
    });
    expect(result.overlap).toEqual([]);
  });

  it("counts each source's coverage, leaving out malicious package advisories", () => {
    const result = compare([
      vuln("CVE-2024-1", [
        match("osv", "GHSA-1", { winning: true }),
        match("nvd", "CVE-2024-1"),
      ]),
      vuln("CVE-2024-2", [match("nvd", "CVE-2024-2", { winning: true })]),
      // Older analyses kept malicious package advisories among vulnerabilities.
      vuln("MAL-2024-7", [match("osv", "MAL-2024-7", { winning: true })]),
      // PHP extension findings carry no source matches.
      vuln("CVE-2024-3"),
    ]);

    expect(result.comparable).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.instances).toEqual({
      total: 4,
      compared: 2,
      malicious_excluded: 1,
      without_source_matches: 1,
    });
    const coverage = Object.fromEntries(
      result.sources.map((s) => [
        s.source,
        [s.instances, s.only_source, s.winning],
      ]),
    );
    expect(coverage).toEqual({
      osv: [1, 0, 1],
      friends_of_php: [0, 0, 0],
      gcve: [0, 0, 0],
      nvd: [2, 1, 1],
    });
  });

  it("labels overlap between sources sharing an origin instead of counting it as corroboration", () => {
    const result = compare([
      // GHSA and the CVE list are independent origins.
      vuln("CVE-2024-1", [
        match("osv", "GHSA-1", { winning: true }),
        match("nvd", "CVE-2024-1"),
      ]),
      // A CVE-list GCVE record and NVD both republish the CVE list.
      vuln("CVE-2024-2", [
        match("gcve", "GCVE-0-2024-1", { winning: true }),
        match("nvd", "CVE-2024-2"),
      ]),
      // FriendsOfPHP citing a GHSA shares that origin with the OSV GHSA record.
      vuln(
        "CVE-2024-1",
        [
          match("osv", "GHSA-2", { winning: true }),
          match("friends_of_php", "FRIENDSOFPHP-a/b/CVE-2024-1"),
        ],
        "a/b",
      ),
      // A record whose origin could not be looked up is not corroboration.
      vuln("CVE-2024-4", [
        match("osv", "GHSA-unknown", { winning: true }),
        match("nvd", "CVE-2024-4"),
      ]),
    ]);

    expect(result.overlap).toEqual([
      {
        sources: ["friends_of_php", "osv"],
        instances: 1,
        same_origin: 1,
        unknown_origin: 0,
        corroborating: 0,
      },
      {
        sources: ["gcve", "nvd"],
        instances: 1,
        same_origin: 1,
        unknown_origin: 0,
        corroborating: 0,
      },
      {
        sources: ["nvd", "osv"],
        instances: 2,
        same_origin: 0,
        unknown_origin: 1,
        corroborating: 1,
      },
    ]);
  });

  it("flags sources that were not comparable when the analysis ran and leaves them out of comparisons", () => {
    const result = compare(
      [
        vuln("CVE-2024-1", [
          match("osv", "GHSA-1", { winning: true }),
          match("nvd", "CVE-2024-1"),
          match("gcve", "GCVE-1-2024-9"),
        ]),
      ],
      { snapshot: healthySnapshot({ nvd: "stale" }) },
    );

    const nvd = result.sources.find((s) => s.source === "nvd");
    expect(nvd).toMatchObject({ status: "stale", comparable: false });
    expect(result.sources.find((s) => s.source === "osv")).toMatchObject({
      status: "healthy",
      comparable: true,
    });
    expect(result.overlap.map((o) => o.sources)).toEqual([["gcve", "osv"]]);
  });

  it("counts severity class disagreements between sources that score with the same CVSS version", () => {
    const cvss = (score: number, cls: string, type = "CVSS_V31") => ({
      severity: { score, type, vector: "", class: cls },
    });
    const result = compare([
      vuln("CVE-2024-1", [
        match("osv", "GHSA-1", {
          winning: true,
          ...cvss(7.5, "HIGH", "CVSS_V3"),
        }),
        match("nvd", "CVE-2024-1", cvss(9.8, "CRITICAL")),
      ]),
      vuln("CVE-2024-2", [
        match("osv", "GHSA-2", { winning: true, ...cvss(5.0, "MEDIUM") }),
        match("nvd", "CVE-2024-2", cvss(6.5, "MEDIUM")),
      ]),
      // CVSS v2 and v3 classes are not comparable.
      vuln("CVE-2024-3", [
        match("osv", "GHSA-3", { winning: true, ...cvss(7.5, "HIGH") }),
        match("nvd", "CVE-2024-3", cvss(5.0, "MEDIUM", "CVSS_V2")),
      ]),
      // A source without a usable score has nothing to compare.
      vuln("CVE-2024-4", [
        match("osv", "GHSA-4", { winning: true }),
        match("nvd", "CVE-2024-4", cvss(5.0, "MEDIUM")),
      ]),
    ]);

    expect(result.severity).toEqual([
      {
        sources: ["nvd", "osv"],
        compared: 2,
        class_disagreements: 1,
        different_cvss_versions: 1,
        mean_score_difference: 1.9,
      },
    ]);
  });

  it("counts affected-version and fixed-version disagreements between sources", () => {
    const affected = (
      ranges: { introduced?: string; fixed?: string }[],
      exact: string[] = [],
    ) => ({ affected: { ranges, exact, universal: false } });
    const result = compare([
      // Same ranges, written in a different order and with an explicit zero start.
      vuln("CVE-2024-1", [
        match("osv", "GHSA-1", {
          winning: true,
          ...affected([
            { introduced: "0", fixed: "1.5.0" },
            { introduced: "2.0.0", fixed: "2.1.0" },
          ]),
        }),
        match(
          "nvd",
          "CVE-2024-1",
          affected([
            { introduced: "2.0.0", fixed: "2.1.0" },
            { fixed: "1.5.0" },
          ]),
        ),
      ]),
      // Same fix, different start of the affected range.
      vuln("CVE-2024-2", [
        match("osv", "GHSA-2", {
          winning: true,
          ...affected([{ introduced: "1.0.0", fixed: "1.5.0" }]),
        }),
        match("nvd", "CVE-2024-2", affected([{ fixed: "1.5.0" }])),
      ]),
      // Different fix.
      vuln("CVE-2024-3", [
        match("osv", "GHSA-3", {
          winning: true,
          ...affected([{ fixed: "1.5.0" }]),
        }),
        match("nvd", "CVE-2024-3", affected([{ fixed: "1.6.0" }], ["1.5.1"])),
      ]),
    ]);

    expect(result.affected_versions).toEqual([
      {
        sources: ["nvd", "osv"],
        compared: 3,
        disagreements: 2,
        fixed_version_disagreements: 1,
      },
    ]);
  });

  it("measures each source's disclosure lag behind the earliest publication of each vulnerability", () => {
    const on = (published: string) => ({ published });
    const result = compare([
      vuln("CVE-2024-1", [
        match("osv", "GHSA-1", {
          winning: true,
          ...on("2024-01-01T00:00:00Z"),
        }),
        match("nvd", "CVE-2024-1", on("2024-01-03T00:00:00Z")),
      ]),
      // A second instance of the same vulnerability is not counted twice.
      vuln(
        "CVE-2024-1",
        [
          match("osv", "GHSA-1", {
            winning: true,
            ...on("2024-01-01T00:00:00Z"),
          }),
          match("nvd", "CVE-2024-1", on("2024-01-03T00:00:00Z")),
        ],
        "lodash-es",
      ),
      vuln("CVE-2024-2", [
        match("osv", "GHSA-2", {
          winning: true,
          ...on("2024-02-05T00:00:00Z"),
        }),
        match("nvd", "CVE-2024-2", on("2024-02-01T00:00:00Z")),
        // FriendsOfPHP dates are fix releases, so they never set the reference.
        match(
          "friends_of_php",
          "FRIENDSOFPHP-a/b/CVE-2024-2",
          on("2024-01-31T00:00:00Z"),
        ),
      ]),
      // One dated source alone has nothing to lag behind.
      vuln("CVE-2024-3", [
        match("nvd", "CVE-2024-3", {
          winning: true,
          ...on("2024-03-01T00:00:00Z"),
        }),
      ]),
    ]);

    const lag = Object.fromEntries(
      result.disclosure_lag.map((l) => [l.source, l]),
    );
    expect(lag["osv"]).toEqual({
      source: "osv",
      date_kind: "published",
      compared: 2,
      first: 1,
      median_days: 2,
      mean_days: 2,
    });
    expect(lag["nvd"]).toEqual({
      source: "nvd",
      date_kind: "published",
      compared: 2,
      first: 1,
      median_days: 1,
      mean_days: 1,
    });
    expect(lag["friends_of_php"]).toEqual({
      source: "friends_of_php",
      date_kind: "earliest_fix_release",
      compared: 1,
      first: 0,
      median_days: -1,
      mean_days: -1,
    });
    expect(lag["gcve"]).toMatchObject({ compared: 0, median_days: null });
  });
});
