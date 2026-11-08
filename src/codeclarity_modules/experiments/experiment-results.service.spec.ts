import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound } from "src/types/error.types";

import { ExperimentResultsService } from "./experiment-results.service";

describe("ExperimentResultsService", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  let service: ExperimentResultsService;
  let hasRequiredRole: jest.Mock;
  let experimentRepository: Record<string, jest.Mock>;
  let runRepository: Record<string, jest.Mock>;
  let summaryRows: jest.Mock;
  let vulnerabilityRows: jest.Mock;
  let probeRows: jest.Mock;

  /** A query builder whose chained calls return itself, ending in rows. */
  function rowsBuilder(getRawMany: jest.Mock): Record<string, jest.Mock> {
    const builder: Record<string, jest.Mock> = { getRawMany };
    for (const method of [
      "select",
      "addSelect",
      "innerJoin",
      "where",
      "andWhere",
      "groupBy",
      "addGroupBy",
      "orderBy",
      "limit",
    ]) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    return builder;
  }

  beforeEach(() => {
    hasRequiredRole = jest.fn().mockResolvedValue(undefined);
    experimentRepository = { findOne: jest.fn() };
    runRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => rowsBuilder(jest.fn())),
    };
    summaryRows = jest.fn().mockResolvedValue([]);
    vulnerabilityRows = jest.fn().mockResolvedValue([]);
    probeRows = jest.fn().mockResolvedValue([]);
    service = new ExperimentResultsService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      experimentRepository as never,
      runRepository as never,
      {
        createQueryBuilder: jest.fn(() => rowsBuilder(summaryRows)),
      } as never,
      {
        createQueryBuilder: jest.fn(() => rowsBuilder(vulnerabilityRows)),
      } as never,
      { query: probeRows } as never,
    );
  });

  /** Two snapshots of one entry: lodash present, then upgraded away. */
  function fixedLodash(): void {
    const at = (day: string): Date => new Date(`${day}T00:00:00Z`);
    runRepository["find"]!.mockResolvedValue([
      { id: "a0", status: "done", error: null, grid_index: 0, grid_date: at("2025-03-01"), commit_hash: "c3d", committed_at: at("2025-02-25"), shared_from: null, dataset_entry: { id: "e1" } },
      { id: "aH", status: "done", error: null, grid_index: 1, grid_date: null, commit_hash: "e5f", committed_at: at("2025-03-28"), shared_from: null, dataset_entry: { id: "e1" } },
    ]);
    vulnerabilityRows.mockResolvedValue([
      {
        run_id: "a0",
        workspace: ".",
        affected_dependency: "lodash",
        affected_version: "4.17.15",
        direct_dependency: true,
        vulnerability_id: "CVE-2021-23337",
        severity_class: "HIGH",
        published_date: "2025-02-10T08:00:00Z",
        epss_score: null,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
      },
    ]);
    probeRows.mockImplementation(async (sql: string) =>
      sql.includes("experiment_probe_outcome")
        ? [{ dataset_entry_id: "e1", commit_hash: "e5f", packages: [{ workspace: ".", name: "lodash", version: "4.17.21", direct: true }] }]
        : [],
    );
  }

  /** A probe of d4e between the two snapshots found the fix there. */
  function probedLodash(): void {
    probeRows.mockImplementation(async (sql: string) => {
      if (sql.includes("experiment_probe_outcome")) {
        return [
          { dataset_entry_id: "e1", commit_hash: "e5f", packages: [{ workspace: ".", name: "lodash", version: "4.17.21", direct: true }] },
          { dataset_entry_id: "e1", commit_hash: "d4e", packages: [{ workspace: ".", name: "lodash", version: "4.17.21", direct: true }] },
        ];
      }
      if (sql.includes("experiment_probe_interval")) {
        return [
          {
            dataset_entry_id: "e1",
            from_commit: "c3d",
            to_commit: "e5f",
            candidates: [
              { sha: "d4e", committed_at: "2025-03-12T09:00:00Z" },
              { sha: "e5f", committed_at: "2025-03-28T00:00:00Z" },
            ],
            error: null,
          },
        ];
      }
      return [{ dataset_entry_id: "e1", commit_hash: "d4e", status: "done", error: null }];
    });
  }

  async function read(stream: NodeJS.ReadableStream): Promise<string> {
    let text = "";
    for await (const chunk of stream) text += String(chunk);
    return text;
  }

  describe("getResults", () => {
    const knowledge = (nvd: string): object => ({
      knowledge_sources: { nvd },
      epss_rows: 5,
    });
    const experiment = {
      id: "exp-1",
      created_on: new Date("2026-11-06T00:00:00Z"),
      started_on: new Date("2026-11-06T00:01:00Z"),
      ended_on: new Date("2026-11-06T02:00:00Z"),
      analyzer_steps: [[{ name: "js-sbom", version: "1.0.0" }]],
      provenance: {
        api_version: "0.0.49-alpha",
        knowledge_start: knowledge("2026-11-05T00:00:00Z"),
        knowledge_end: knowledge("2026-11-06T01:00:00Z"),
      },
      created_by: { first_name: "John", last_name: "Doe" },
    };

    it("requires membership and aggregates the experiment's copied rows", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);
      runRepository["find"]!.mockResolvedValue([
        { status: "done", error: null },
        { status: "done", error: null },
        { status: "failed", error: "missing result: js-sbom" },
      ]);
      summaryRows.mockResolvedValue([
        { run_id: "r1", rank: 0, total_dependencies: 10, total_vulnerabilities: 2, package_manager: "NPM" },
        { run_id: "r2", rank: 1, total_dependencies: 5, total_vulnerabilities: 0, package_manager: "NPM" },
      ]);
      const instance = {
        run_id: "r1",
        affected_dependency: "lodash",
        vulnerability_id: "CVE-2021-23337",
        severity_class: "HIGH",
        epss_score: 0.02,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
      };
      vulnerabilityRows.mockResolvedValue([instance, instance]);

      const results = await service.getResults("org-1", "exp-1", user);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.USER,
      );
      expect(experimentRepository["findOne"]).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "exp-1", organization: { id: "org-1" } },
        }),
      );
      expect(results.coverage).toMatchObject({ runs: 3, done: 2, failed: 1 });
      expect(results.headline).toMatchObject({
        n_projects: 2,
        n_affected: 1,
        instances: 2,
        top_packages: [["lodash", 1]],
      });
      expect(results.rqd).toEqual([
        { package_manager: "NPM", projects: 2, med_deps: 7.5, med_vulns: 1 },
      ]);
      expect(results.provenance).toEqual({
        api_version: "0.0.49-alpha",
        analyzer_steps: experiment.analyzer_steps,
        knowledge_start: experiment.provenance.knowledge_start,
        knowledge_end: experiment.provenance.knowledge_end,
        knowledge_changed: true,
        created_by: "John Doe",
        created_on: experiment.created_on,
        started_on: experiment.started_on,
        ended_on: experiment.ended_on,
      });
    });

    it("aggregates a grid experiment over HEAD, reading the rows a HEAD run shares", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);
      const grid = new Date("2026-10-06T00:00:00Z");
      runRepository["find"]!.mockResolvedValue([
        { id: "a0", status: "done", error: null, grid_date: grid, shared_from: null },
        { id: "aH", status: "done", error: null, grid_date: null, shared_from: { id: "a0" } },
        { id: "b0", status: "done", error: null, grid_date: grid, shared_from: null },
        { id: "bH", status: "failed", error: "ceiling", grid_date: null, shared_from: null },
      ]);
      summaryRows.mockResolvedValue([
        { run_id: "a0", rank: 0, total_dependencies: 10, total_vulnerabilities: 0, package_manager: "NPM" },
        { run_id: "b0", rank: 1, total_dependencies: 5, total_vulnerabilities: 0, package_manager: "NPM" },
      ]);

      const results = await service.getResults("org-1", "exp-1", user);

      expect(results.coverage).toMatchObject({ runs: 2, done: 1, failed: 1 });
      expect(results.headline.n_projects).toBe(1);
      expect(results.rqd).toEqual([
        { package_manager: "NPM", projects: 1, med_deps: 10, med_vulns: 0 },
      ]);
    });

    it("has no provenance snapshots before the experiment started", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        ...experiment,
        started_on: null,
        ended_on: null,
        analyzer_steps: null,
        provenance: null,
        created_by: null,
      });

      const { provenance } = await service.getResults("org-1", "exp-1", user);

      expect(provenance).toMatchObject({
        api_version: null,
        knowledge_start: null,
        knowledge_end: null,
        knowledge_changed: false,
        created_by: null,
      });
    });

    it("hides experiments of other organizations", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(null);

      await expect(
        service.getResults("org-1", "exp-9", user),
      ).rejects.toBeInstanceOf(EntityNotFound);
      expect(vulnerabilityRows).not.toHaveBeenCalled();
    });
  });

  describe("exports", () => {
    const exports = [
      ["exportRunsCsv"],
      ["exportVulnerabilitiesCsv"],
      ["exportExposuresCsv"],
      ["exportFixesCsv"],
      ["exportResults"],
    ] as const;

    it.each(exports)(
      "%s requires membership and names the experiment",
      async (method) => {
        experimentRepository["findOne"]!.mockResolvedValue({
          id: "exp-1",
          name: "top100-head",
          created_on: new Date("2026-11-06T00:00:00Z"),
        });

        const exported = await service[method]("org-1", "exp-1", user);

        expect(hasRequiredRole).toHaveBeenCalledWith(
          "org-1",
          "user-1",
          MemberRole.USER,
        );
        expect(experimentRepository["findOne"]).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "exp-1", organization: { id: "org-1" } },
          }),
        );
        expect(exported.experiment_name).toBe("top100-head");
        if ("stream" in exported) exported.stream.destroy();
      },
    );

    it.each(exports)(
      "%s hides experiments of other organizations",
      async (method) => {
        experimentRepository["findOne"]!.mockResolvedValue(null);

        await expect(
          service[method]("org-1", "exp-9", user),
        ).rejects.toBeInstanceOf(EntityNotFound);
      },
    );

    it("exportResults carries the results payload", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "top100-head",
        created_on: new Date("2026-11-06T00:00:00Z"),
      });
      runRepository["find"]!.mockResolvedValue([
        { status: "failed", error: "missing result: js-sbom" },
      ]);

      const { results } = await service.exportResults("org-1", "exp-1", user);

      expect(results.coverage).toMatchObject({ runs: 1, failed: 1 });
    });

    it("derives fix lag from snapshot rows and the probe outcome after the fix", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1", name: "x", created_on: new Date() });
      fixedLodash();

      const { results } = await service.exportResults("org-1", "exp-1", user);

      expect(results.fix_lag.by_kind).toEqual([
        expect.objectContaining({ key: "upgraded", n: 1, median: 46 }),
      ]);
      expect(probeRows).toHaveBeenCalledWith(expect.any(String), ["exp-1"]);
    });

    it("streams fixes.csv and exposures.csv computed on read, per entry by rank", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1", name: "x", created_on: new Date() });
      fixedLodash();
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() => rowsBuilder(entries));

      const fixes = await read((await service.exportFixesCsv("org-1", "exp-1", user)).stream);
      expect(fixes.split("\r\n")).toEqual([
        "rank,full_name,vulnerability_id,affected_dependency,severity,published_date,fix_date,fix_commit,fix_kind,precision,probe_outcome,probe_reason,interval_from,interval_to,lag_days",
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-28,e5f,upgraded,snapshot,,,2025-03-01,HEAD,46",
        "",
      ]);

      entries.mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      const exposures = await read((await service.exportExposuresCsv("org-1", "exp-1", user)).stream);
      expect(exposures.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-01,2025-03-01,0,fixed,,,,,2025-03-28,e5f,snapshot,upgraded,46",
      );
    });

    it("dates a fix to the commit a stored probe located, keeping its snapshot interval", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1", name: "x", created_on: new Date() });
      fixedLodash();
      probedLodash();
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() => rowsBuilder(entries));

      const fixes = await read((await service.exportFixesCsv("org-1", "exp-1", user)).stream);
      expect(fixes.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-12,d4e,upgraded,commit,found,,2025-03-01,HEAD,30",
      );
      const { results } = await service.exportResults("org-1", "exp-1", user);
      expect(results.probes.fixes).toEqual({ found: 1, ambiguous: 0, not_found: 0, not_probed: 0 });
    });

    it("reports a fix its spent budget left unprobed as budget spent, at snapshot precision", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1", name: "x", created_on: new Date(), analysis_budget: 2 });
      fixedLodash();
      probedLodash();
      const listed = probeRows.getMockImplementation()!;
      // d4e was never probed: the two snapshots spent the budget
      probeRows.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes("SUM(attempts)")) return [{ submitted: "2" }];
        if (sql.includes("FROM experiment_probe\n") || sql.includes("FROM experiment_probe\r")) return [];
        const rows = (await listed(sql, params)) as { commit_hash?: string }[];
        return sql.includes("experiment_probe_outcome") ? rows.filter((r) => r.commit_hash !== "d4e") : rows;
      });
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() => rowsBuilder(entries));

      const fixes = await read((await service.exportFixesCsv("org-1", "exp-1", user)).stream);
      expect(fixes.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-28,e5f,upgraded,snapshot,not_found,budget spent,2025-03-01,HEAD,46",
      );
      const { results } = await service.exportResults("org-1", "exp-1", user);
      expect(results.probes.budget).toEqual({ analysis_budget: 2, analyses_submitted: 2, spent: true });
    });
  });
});
