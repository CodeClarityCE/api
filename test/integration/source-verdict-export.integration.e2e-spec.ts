import { randomUUID } from "crypto";

import { MemberRole } from "../../src/base_modules/organizations/memberships/orgMembership.types";
import { testHelper, type TestUser } from "../utils/integration-test-helper";

const finding = (
  id: string,
  dependency: string,
  version: string,
  verdicts?: unknown[],
) => ({
  Id: `${id}-${version}`,
  Sources: ["OSV"],
  AffectedDependency: dependency,
  AffectedVersion: version,
  VulnerabilityId: id,
  Severity: { Severity: 7.5, SeverityClass: "HIGH", SeverityType: "CVSS_V31" },
  Weaknesses: [],
  Conflict: { ConflictWinner: "OSV", ConflictFlag: "NO_CONFLICT" },
  ...(verdicts ? { SourceVerdicts: verdicts } : {}),
});

const withEcosystem = <T extends object>(ecosystem: string, f: T) => ({
  ...f,
  Ecosystem: ecosystem,
});

const source = (name: string, status: string) => ({
  source: name,
  status,
  comparable: status === "healthy",
  watermark: null,
  row_count: 1,
  last_outcome: status === "failed" ? "failure" : "success",
  stale_after_hours: 48,
});

const snapshot = {
  taken_at: "2099-01-01T00:00:00Z",
  sources: [
    source("osv", "healthy"),
    source("nvd", "healthy"),
    source("gcve", "stale"),
  ],
};

// Keys in jsonb order (shorter first), as stored results give them back.
const EVALUATED = {
  exact: [],
  ranges: [{ fixed: "2.0.0", introduced: "1.0.0" }],
  universal: false,
};
const UNAFFECTED = {
  exact: [],
  ranges: [{ fixed: "2.0.0", introduced: "1.3.0" }],
  universal: false,
};

const withVerdicts = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        finding("CVE-2099-0001", "lodash", "1.1.0", [
          {
            source: "osv",
            verdict: "matched",
            evidence: { record_ids: ["GHSA-test-0001", "GHSA-test-0002"] },
          },
          { source: "nvd", verdict: "no_record" },
          {
            source: "gcve",
            verdict: "stale_or_failed",
            evidence: { source_status: "stale" },
          },
        ]),
        withEcosystem(
          "npm",
          finding("CVE-2099-0003", "left-pad", "1.3.0", [
            {
              source: "osv",
              verdict: "names_another_product",
              evidence: {
                record_ids: ["GHSA-test-0004"],
                names: [{ package: "left-pad", ecosystem: "PyPI" }],
              },
            },
            {
              source: "nvd",
              verdict: "retired",
              evidence: {
                record_ids: ["CVE-2099-0003"],
                retired_reason: "rejected",
                retired_at: "2099-01-02T00:00:00Z",
              },
            },
            {
              source: "gcve",
              verdict: "version_excluded",
              evidence: {
                record_ids: ["GCVE-1-2099-0003"],
                evaluated: EVALUATED,
                unaffected: UNAFFECTED,
              },
            },
          ]),
        ),
      ],
    },
    "packages/web": {
      Vulnerabilities: [
        finding("CVE-2099-0002", "minimist", "0.0.8", [
          {
            source: "osv",
            verdict: "matched",
            evidence: { record_ids: ["GHSA-test-0003"] },
          },
        ]),
      ],
    },
  },
  analysis_info: { status: "success", knowledge_snapshot: snapshot },
};

const withoutVerdicts = {
  workspaces: {
    ".": { Vulnerabilities: [finding("CVE-2099-0001", "lodash", "1.1.0")] },
  },
  analysis_info: { status: "success" },
};

// An analysis whose snapshot did not record the sources' state.
const withoutSnapshot = {
  workspaces: {
    ".": {
      Vulnerabilities: [
        finding("CVE-2099-0001", "lodash", "1.1.0", [
          {
            source: "osv",
            verdict: "stale_or_failed",
            evidence: { source_status: "unknown" },
          },
        ]),
      ],
    },
  },
  analysis_info: { status: "success" },
};

const NO_NEW_EVIDENCE = {
  evidence_evaluated: null,
  evidence_unaffected: null,
  evidence_retired_reason: null,
  evidence_retired_at: null,
  evidence_names: null,
};

// Known-good rows for the analysis above, one per instance and source.
const ROWS = [
  {
    workspace: ".",
    vulnerability_id: "CVE-2099-0001",
    dependency: "lodash",
    version: "1.1.0",
    ecosystem: null,
    source: "osv",
    verdict: "matched",
    source_status_at_analysis: "healthy",
    source_stale_or_failed: false,
    evidence_record_ids: "GHSA-test-0001;GHSA-test-0002",
    evidence_source_status: null,
    ...NO_NEW_EVIDENCE,
  },
  {
    workspace: ".",
    vulnerability_id: "CVE-2099-0001",
    dependency: "lodash",
    version: "1.1.0",
    ecosystem: null,
    source: "nvd",
    verdict: "no_record",
    source_status_at_analysis: "healthy",
    source_stale_or_failed: false,
    evidence_record_ids: null,
    evidence_source_status: null,
    ...NO_NEW_EVIDENCE,
  },
  {
    workspace: ".",
    vulnerability_id: "CVE-2099-0001",
    dependency: "lodash",
    version: "1.1.0",
    ecosystem: null,
    source: "gcve",
    verdict: "stale_or_failed",
    source_status_at_analysis: "stale",
    source_stale_or_failed: true,
    evidence_record_ids: null,
    evidence_source_status: "stale",
    ...NO_NEW_EVIDENCE,
  },
  ...(["osv", "nvd", "gcve"] as const).map((name) => ({
    workspace: ".",
    vulnerability_id: "CVE-2099-0003",
    dependency: "left-pad",
    version: "1.3.0",
    ecosystem: "npm",
    source: name,
    verdict: {
      osv: "names_another_product",
      nvd: "retired",
      gcve: "version_excluded",
    }[name],
    source_status_at_analysis: name === "gcve" ? "stale" : "healthy",
    source_stale_or_failed: name === "gcve",
    evidence_record_ids: {
      osv: "GHSA-test-0004",
      nvd: "CVE-2099-0003",
      gcve: "GCVE-1-2099-0003",
    }[name],
    evidence_source_status: null,
    ...NO_NEW_EVIDENCE,
    ...{
      osv: {
        evidence_names: JSON.stringify([
          { package: "left-pad", ecosystem: "PyPI" },
        ]),
      },
      nvd: {
        evidence_retired_reason: "rejected",
        evidence_retired_at: "2099-01-02T00:00:00Z",
      },
      gcve: {
        evidence_evaluated: JSON.stringify(EVALUATED),
        evidence_unaffected: JSON.stringify(UNAFFECTED),
      },
    }[name],
  })),
  {
    workspace: "packages/web",
    vulnerability_id: "CVE-2099-0002",
    dependency: "minimist",
    version: "0.0.8",
    ecosystem: null,
    source: "osv",
    verdict: "matched",
    source_status_at_analysis: "healthy",
    source_stale_or_failed: false,
    evidence_record_ids: "GHSA-test-0003",
    evidence_source_status: null,
    ...NO_NEW_EVIDENCE,
  },
];

const CSV = [
  "workspace,vulnerability_id,dependency,version,ecosystem,source,verdict,source_status_at_analysis,source_stale_or_failed,evidence_record_ids,evidence_source_status,evidence_evaluated,evidence_unaffected,evidence_retired_reason,evidence_retired_at,evidence_names",
  ".,CVE-2099-0001,lodash,1.1.0,,osv,matched,healthy,false,GHSA-test-0001;GHSA-test-0002,,,,,,",
  ".,CVE-2099-0001,lodash,1.1.0,,nvd,no_record,healthy,false,,,,,,,",
  ".,CVE-2099-0001,lodash,1.1.0,,gcve,stale_or_failed,stale,true,,stale,,,,,",
  '.,CVE-2099-0003,left-pad,1.3.0,npm,osv,names_another_product,healthy,false,GHSA-test-0004,,,,,,"[{""package"":""left-pad"",""ecosystem"":""PyPI""}]"',
  ".,CVE-2099-0003,left-pad,1.3.0,npm,nvd,retired,healthy,false,CVE-2099-0003,,,,rejected,2099-01-02T00:00:00Z,",
  '.,CVE-2099-0003,left-pad,1.3.0,npm,gcve,version_excluded,stale,true,GCVE-1-2099-0003,,"{""exact"":[],""ranges"":[{""fixed"":""2.0.0"",""introduced"":""1.0.0""}],""universal"":false}","{""exact"":[],""ranges"":[{""fixed"":""2.0.0"",""introduced"":""1.3.0""}],""universal"":false}",,,',
  "packages/web,CVE-2099-0002,minimist,0.0.8,,osv,matched,healthy,false,GHSA-test-0003,,,,,,",
  "",
].join("\r\n");

// Splits one CSV line into cells, undoing the quoting of cells with commas or quotes.
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quoted && char === '"' && line[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

// Parses the export's CSV back into rows typed like the JSON rows.
function parseCsv(text: string): Record<string, unknown>[] {
  const [header, ...lines] = text.trimEnd().split("\r\n");
  const columns = header!.split(",");
  return lines.map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(
      columns.map((column, i) => {
        const cell = cells[i]!;
        if (cell === "") return [column, null];
        if (cell === "true" || cell === "false")
          return [column, cell === "true"];
        return [column, cell];
      }),
    );
  });
}

describe("Source verdict export (e2e)", () => {
  let user: TestUser;
  let base: string;
  let withId: string;
  let withoutId: string;
  let unknownId: string;

  beforeAll(async () => {
    await testHelper.setupTestApp();
  });

  afterAll(async () => {
    await testHelper.teardownTestApp();
  });

  beforeEach(async () => {
    await testHelper.cleanDatabase();
    user = await testHelper.createTestUser({
      email: "admin@verdict-export.com",
      role: MemberRole.ADMIN,
    });
    const orgId = user.organization.id;
    const project = await testHelper.makeAuthenticatedRequest(
      "POST",
      `/org/${orgId}/projects`,
      user.accessToken,
      { name: "Exported project", description: "Has verdicts" },
    );
    const projectId = project.json().id as string;
    base = `/org/${orgId}/projects/${projectId}/analysis`;

    const data = testHelper.getDataSource();
    withId = randomUUID();
    withoutId = randomUUID();
    unknownId = randomUUID();
    for (const [id, output] of [
      [withId, withVerdicts],
      [withoutId, withoutVerdicts],
      [unknownId, withoutSnapshot],
    ] as const) {
      await data.query(
        `INSERT INTO analysis (id, created_on, config, status, steps, branch, "projectId", "organizationId")
         VALUES ($1, now(), '{}', 'completed', '[]', 'main', $2, $3)`,
        [id, projectId, orgId],
      );
      await data.query(
        `INSERT INTO result (result, plugin, created_on, "analysisId") VALUES ($1, 'vuln-finder', now(), $2)`,
        [JSON.stringify(output), id],
      );
    }
  });

  const exportOf = (analysisId: string, query: string) =>
    testHelper.makeAuthenticatedRequest(
      "GET",
      `${base}/${analysisId}/vulnerabilities/source-verdicts?${query}`,
      user.accessToken,
    );

  it("exports one CSV row per instance and source as a download", async () => {
    const response = await exportOf(withId, "format=csv");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="source-verdicts-${withId}.csv"`,
    );
    expect(response.body).toBe(CSV);
  });

  it("exports the same rows as JSON", async () => {
    const response = await exportOf(withId, "format=json");

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers["content-disposition"]).toBe(
      `attachment; filename="source-verdicts-${withId}.json"`,
    );
    const body = response.json();
    expect(body.rows).toEqual(ROWS);
    expect(body.columns).toEqual(Object.keys(ROWS[0]!));

    const csv = await exportOf(withId, "format=csv");
    expect(parseCsv(csv.body)).toEqual(body.rows);
  });

  it("narrows the export to one workspace", async () => {
    const response = await exportOf(
      withId,
      "format=json&workspace=packages/web",
    );

    expect(response.json().rows).toEqual(
      ROWS.filter((row) => row.workspace === "packages/web"),
    );
  });

  it.each(["csv", "json"])(
    "answers not available in %s for an analysis stored without verdicts",
    async (format) => {
      const response = await exportOf(withoutId, `format=${format}`);

      expect(response.statusCode).toBe(409);
      expect(response.json().error_code).toBe("SourceVerdictsNotAvailable");
    },
  );

  it("flags a source of unknown state as stale or failed, as its verdict does", async () => {
    const response = await exportOf(unknownId, "format=json");

    expect(response.json().rows).toEqual([
      expect.objectContaining({
        source: "osv",
        verdict: "stale_or_failed",
        source_status_at_analysis: "unknown",
        source_stale_or_failed: true,
      }),
    ]);
  });

  it("rejects an unknown format", async () => {
    const response = await exportOf(withId, "format=xlsx");

    expect(response.statusCode).toBe(400);
  });
});
