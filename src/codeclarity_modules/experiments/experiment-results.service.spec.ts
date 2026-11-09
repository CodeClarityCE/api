import { createHash } from "node:crypto";
import { crc32, inflateRawSync } from "node:zlib";
import { QueryFailedError } from "typeorm";

import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";

import { buildReplicationPackage } from "./experiment-replication-package";
import { ExperimentResultsService } from "./experiment-results.service";
import {
  ExperimentAlreadyPublished,
  ExperimentNotPublishable,
} from "./experiments.errors";

// Tests move the metric version to publish a second one.
let mockMetricVersion = 1;
jest.mock("./experiment-metric-version", () => ({
  get METRIC_VERSION(): number {
    return mockMetricVersion;
  },
}));

describe("ExperimentResultsService", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  let service: ExperimentResultsService;
  let hasRequiredRole: jest.Mock;
  let experimentRepository: Record<string, jest.Mock>;
  let runRepository: Record<string, jest.Mock>;
  let summaryRows: jest.Mock;
  let vulnerabilityRows: jest.Mock;
  let probeRows: jest.Mock;
  let publishedRepository: Record<string, jest.Mock>;

  /** A query builder whose chained calls return itself, ending in rows. */
  function rowsBuilder(getRawMany: jest.Mock): Record<string, jest.Mock> {
    const builder: Record<string, jest.Mock> = { getRawMany };
    for (const method of [
      "select",
      "addSelect",
      "innerJoin",
      "leftJoin",
      "where",
      "andWhere",
      "groupBy",
      "addGroupBy",
      "orderBy",
      "addOrderBy",
      "limit",
    ]) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    return builder;
  }

  beforeEach(() => {
    mockMetricVersion = 1;
    hasRequiredRole = jest.fn().mockResolvedValue(undefined);
    experimentRepository = { findOne: jest.fn() };
    runRepository = {
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() =>
        rowsBuilder(jest.fn().mockResolvedValue([])),
      ),
    };
    summaryRows = jest.fn().mockResolvedValue([]);
    vulnerabilityRows = jest.fn().mockResolvedValue([]);
    probeRows = jest.fn().mockResolvedValue([]);
    publishedRepository = {
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((value: object) => Promise.resolve(value)),
    };
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
      publishedRepository as never,
    );
  });

  /** Reads a ZIP from its central directory, checking each entry's CRC. */
  function unzip(archive: Buffer): Map<string, string> {
    const end = archive.lastIndexOf(Buffer.from("PK\x05\x06", "latin1"));
    const count = archive.readUInt16LE(end + 10);
    let at = archive.readUInt32LE(end + 16);
    const files = new Map<string, string>();
    for (let index = 0; index < count; index++) {
      const crc = archive.readUInt32LE(at + 16);
      const compressedSize = archive.readUInt32LE(at + 20);
      const nameLength = archive.readUInt16LE(at + 28);
      const extraLength = archive.readUInt16LE(at + 30);
      const commentLength = archive.readUInt16LE(at + 32);
      const local = archive.readUInt32LE(at + 42);
      const name = archive.toString("utf8", at + 46, at + 46 + nameLength);
      const start =
        local +
        30 +
        archive.readUInt16LE(local + 26) +
        archive.readUInt16LE(local + 28);
      const body = inflateRawSync(
        archive.subarray(start, start + compressedSize),
      );
      expect(crc32(body)).toBe(crc);
      files.set(name, body.toString("utf8"));
      at += 46 + nameLength + extraLength + commentLength;
    }
    return files;
  }

  /** Two snapshots of one entry: lodash present, then upgraded away. */
  function fixedLodash(): void {
    const at = (day: string): Date => new Date(`${day}T00:00:00Z`);
    runRepository["find"]!.mockResolvedValue([
      {
        id: "a0",
        status: "done",
        error: null,
        grid_index: 0,
        grid_date: at("2025-03-01"),
        commit_hash: "c3d",
        committed_at: at("2025-02-25"),
        shared_from: null,
        dataset_entry: { id: "e1" },
      },
      {
        id: "aH",
        status: "done",
        error: null,
        grid_index: 1,
        grid_date: null,
        commit_hash: "e5f",
        committed_at: at("2025-03-28"),
        shared_from: null,
        dataset_entry: { id: "e1" },
      },
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
        ? [
            {
              dataset_entry_id: "e1",
              commit_hash: "e5f",
              packages: [
                {
                  workspace: ".",
                  name: "lodash",
                  version: "4.17.21",
                  direct: true,
                },
              ],
            },
          ]
        : [],
    );
  }

  /** A probe of d4e between the two snapshots found the fix there. */
  function probedLodash(): void {
    probeRows.mockImplementation(async (sql: string) => {
      if (sql.includes("experiment_probe_outcome")) {
        return [
          {
            dataset_entry_id: "e1",
            commit_hash: "e5f",
            packages: [
              {
                workspace: ".",
                name: "lodash",
                version: "4.17.21",
                direct: true,
              },
            ],
          },
          {
            dataset_entry_id: "e1",
            commit_hash: "d4e",
            packages: [
              {
                workspace: ".",
                name: "lodash",
                version: "4.17.21",
                direct: true,
              },
            ],
          },
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
      return [
        {
          dataset_entry_id: "e1",
          commit_hash: "d4e",
          status: "done",
          error: null,
        },
      ];
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
        {
          run_id: "r1",
          rank: 0,
          total_dependencies: 10,
          total_vulnerabilities: 2,
          package_manager: "NPM",
        },
        {
          run_id: "r2",
          rank: 1,
          total_dependencies: 5,
          total_vulnerabilities: 0,
          package_manager: "NPM",
        },
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
        bootstrap: {
          method: "percentile bootstrap, resampling by project",
          confidence: 0.95,
          resamples: 10_000,
          seed: 20_260_611,
        },
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
        {
          id: "a0",
          status: "done",
          error: null,
          grid_date: grid,
          shared_from: null,
        },
        {
          id: "aH",
          status: "done",
          error: null,
          grid_date: null,
          shared_from: { id: "a0" },
        },
        {
          id: "b0",
          status: "done",
          error: null,
          grid_date: grid,
          shared_from: null,
        },
        {
          id: "bH",
          status: "failed",
          error: "ceiling",
          grid_date: null,
          shared_from: null,
        },
      ]);
      summaryRows.mockResolvedValue([
        {
          run_id: "a0",
          rank: 0,
          total_dependencies: 10,
          total_vulnerabilities: 0,
          package_manager: "NPM",
        },
        {
          run_id: "b0",
          rank: 1,
          total_dependencies: 5,
          total_vulnerabilities: 0,
          package_manager: "NPM",
        },
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

    describe("bootstrap intervals", () => {
      const twoProjects = [
        { run_id: "r1", rank: 0 },
        { run_id: "r2", rank: 1 },
      ].map((row) => ({
        ...row,
        total_dependencies: 10,
        total_vulnerabilities: 0,
        package_manager: "NPM",
      }));
      const instanceOf = (run_id: string): object => ({
        run_id,
        affected_dependency: "lodash",
        vulnerability_id: "CVE-2021-23337",
        severity_class: "HIGH",
        epss_score: null,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
      });

      beforeEach(() => {
        summaryRows.mockResolvedValue(twoProjects);
        vulnerabilityRows.mockResolvedValue([instanceOf("r1")]);
      });

      it("computes them once for an ended experiment", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        const first = await service.getResults("org-1", "exp-1", user);
        expect(first.bootstrap_intervals?.headline.load_median).toEqual({
          low: 0,
          high: 1,
        });

        const second = await service.getResults("org-1", "exp-1", user);
        expect(second.bootstrap_intervals).toEqual(first.bootstrap_intervals);
      });

      it("reads an ended experiment's rows once", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        const first = await service.getResults("org-1", "exp-1", user);

        vulnerabilityRows.mockResolvedValue([
          instanceOf("r1"),
          instanceOf("r2"),
        ]);
        const second = await service.getResults("org-1", "exp-1", user);

        expect(vulnerabilityRows).toHaveBeenCalledTimes(1);
        expect(second.headline).toEqual(first.headline);
      });

      it("shares the rows between results and Figures", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        await service.getResults("org-1", "exp-1", user);
        await service.figureRows(experiment as never);

        expect(vulnerabilityRows).toHaveBeenCalledTimes(1);
      });

      it("reports how far the stored rows have been read", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        const seen: unknown[] = [];
        probeRows.mockImplementation(async (sql: string) => {
          if (sql.startsWith("SELECT id")) {
            return Array.from({ length: 25 }, (_, i) => ({ id: `p${i}` }));
          }
          if (sql.includes("vulnerable AS")) {
            seen.push(await service.loadProgress("org-1", "exp-1", user));
          }
          return [];
        });

        await service.getResults("org-1", "exp-1", user);

        expect(seen).toEqual([
          { done: 0, total: 25 },
          { done: 20, total: 25 },
        ]);
        await expect(
          service.loadProgress("org-1", "exp-1", user),
        ).resolves.toEqual({ done: 0, total: 0 });
      });

      it("reads the rows again after a failed read", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        vulnerabilityRows.mockRejectedValueOnce(new Error("connection lost"));
        await expect(
          service.getResults("org-1", "exp-1", user),
        ).rejects.toThrow("connection lost");

        await service.getResults("org-1", "exp-1", user);

        expect(vulnerabilityRows).toHaveBeenCalledTimes(2);
      });

      it("reads the rows on every read while the experiment has not ended", async () => {
        experimentRepository["findOne"]!.mockResolvedValue({
          ...experiment,
          ended_on: null,
        });
        await service.getResults("org-1", "exp-1", user);
        await service.getResults("org-1", "exp-1", user);

        expect(vulnerabilityRows).toHaveBeenCalledTimes(2);
      });

      it("computes them once for concurrent reads of an ended experiment", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        vulnerabilityRows
          .mockResolvedValueOnce([instanceOf("r1")])
          .mockResolvedValueOnce([instanceOf("r1"), instanceOf("r2")]);

        const [first, second] = await Promise.all([
          service.getResults("org-1", "exp-1", user),
          service.getResults("org-1", "exp-1", user),
        ]);

        expect(second.bootstrap_intervals).toEqual(first.bootstrap_intervals);
      });

      it("computes them again when the experiment ended at another time", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(experiment);
        const first = await service.getResults("org-1", "exp-1", user);

        vulnerabilityRows.mockResolvedValue([
          instanceOf("r1"),
          instanceOf("r2"),
        ]);
        experimentRepository["findOne"]!.mockResolvedValue({
          ...experiment,
          ended_on: new Date("2026-11-07T02:00:00Z"),
        });
        const second = await service.getResults("org-1", "exp-1", user);
        expect(second.bootstrap_intervals).not.toEqual(
          first.bootstrap_intervals,
        );
      });

      it("leaves them out while the experiment has not ended", async () => {
        experimentRepository["findOne"]!.mockResolvedValue({
          ...experiment,
          ended_on: null,
        });
        const results = await service.getResults("org-1", "exp-1", user);
        expect(results.bootstrap_intervals).toBeNull();
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
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "x",
        created_on: new Date(),
      });
      fixedLodash();

      const { results } = await service.exportResults("org-1", "exp-1", user);

      expect(results.fix_lag.by_kind).toEqual([
        expect.objectContaining({ key: "upgraded", n: 1, median: 46 }),
      ]);
      expect(probeRows).toHaveBeenCalledWith(expect.any(String), ["exp-1"]);
    });

    it("streams fixes.csv and exposures.csv computed on read, per entry by rank", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "x",
        created_on: new Date(),
      });
      fixedLodash();
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() =>
        rowsBuilder(entries),
      );

      const fixes = await read(
        (await service.exportFixesCsv("org-1", "exp-1", user)).stream,
      );
      expect(fixes.split("\r\n")).toEqual([
        "rank,full_name,vulnerability_id,affected_dependency,severity,published_date,fix_date,fix_commit,fix_kind,precision,probe_outcome,probe_reason,interval_from,interval_to,lag_days",
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-28,e5f,upgraded,snapshot,,,2025-03-01,HEAD,46",
        "",
      ]);

      entries.mockResolvedValueOnce([
        { id: "e1", rank: 0, full_name: "octo/app" },
      ]);
      const exposures = await read(
        (await service.exportExposuresCsv("org-1", "exp-1", user)).stream,
      );
      expect(exposures.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-01,2025-03-01,0,fixed,,,,,2025-03-28,e5f,snapshot,upgraded,46",
      );
    });

    it("dates a fix to the commit a stored probe located, keeping its snapshot interval", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "x",
        created_on: new Date(),
      });
      fixedLodash();
      probedLodash();
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() =>
        rowsBuilder(entries),
      );

      const fixes = await read(
        (await service.exportFixesCsv("org-1", "exp-1", user)).stream,
      );
      expect(fixes.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-12,d4e,upgraded,commit,found,,2025-03-01,HEAD,30",
      );
      const { results } = await service.exportResults("org-1", "exp-1", user);
      expect(results.probes.fixes).toEqual({
        found: 1,
        ambiguous: 0,
        not_found: 0,
        not_probed: 0,
      });
    });

    it("dates fixes in fixes.csv as the results page does, with versions seen vulnerable in any entry", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "x",
        created_on: new Date(),
      });
      const at = (day: string): Date => new Date(`${day}T00:00:00Z`);
      const run = (
        id: string,
        entry: string,
        gridIndex: number,
        commit: string,
        day: string,
      ) => ({
        id,
        status: "done",
        error: null,
        grid_index: gridIndex,
        grid_date: gridIndex === 0 ? at("2025-03-01") : null,
        commit_hash: commit,
        committed_at: at(day),
        shared_from: null,
        dataset_entry: { id: entry },
      });
      const runs = [
        run("a0", "e1", 0, "c3d", "2025-02-25"),
        run("aH", "e1", 1, "e5f", "2025-03-28"),
        run("b0", "e2", 0, "x1", "2025-02-20"),
        run("bH", "e2", 1, "x3", "2025-03-30"),
      ];
      runRepository["find"]!.mockImplementation(
        async ({
          where,
        }: {
          where: { dataset_entry?: { id: { value: string[] } } };
        }) =>
          where.dataset_entry
            ? runs.filter((r) =>
                where.dataset_entry!.id.value.includes(r.dataset_entry.id),
              )
            : runs,
      );
      // No vulnerable ranges stored: probes fall back to versions seen vulnerable
      const instance = (runId: string, version: string) => ({
        run_id: runId,
        workspace: ".",
        affected_dependency: "lodash",
        affected_version: version,
        direct_dependency: true,
        vulnerability_id: "CVE-2021-23337",
        severity_class: "HIGH",
        published_date: "2025-02-10T08:00:00Z",
        epss_score: null,
        conflict_flag: "MATCH_CORRECT",
        winning_source: "OSV",
        withdrawn_date: null,
        vulnerable_versions: null,
      });
      const instances = [instance("a0", "4.17.15"), instance("b0", "4.17.16")];
      let runIds: string[] | null = null;
      const builder = rowsBuilder(
        jest.fn(async () =>
          runIds
            ? instances.filter((i) => runIds!.includes(i.run_id))
            : instances,
        ),
      );
      builder["andWhere"] = jest.fn(
        (_sql: string, params?: { runIds?: string[] }) => {
          runIds = params?.runIds ?? runIds;
          return builder;
        },
      );
      const vulnerabilityBuilder = jest.fn(() => {
        runIds = null;
        return builder;
      });
      const lodash = (version: string) => [
        { workspace: ".", name: "lodash", version, direct: true },
      ];
      const outcomes = [
        {
          dataset_entry_id: "e1",
          commit_hash: "e5f",
          packages: lodash("4.17.21"),
        },
        // e2 probed x2 at a version only e1 saw vulnerable
        {
          dataset_entry_id: "e2",
          commit_hash: "x2",
          packages: lodash("4.17.15"),
        },
        {
          dataset_entry_id: "e2",
          commit_hash: "x3",
          packages: lodash("4.17.21"),
        },
      ];
      const intervals = [
        {
          dataset_entry_id: "e2",
          from_commit: "x1",
          to_commit: "x3",
          error: null,
          candidates: [
            { sha: "x2", committed_at: "2025-03-10T00:00:00Z" },
            { sha: "x3", committed_at: "2025-03-30T00:00:00Z" },
          ],
        },
      ];
      const analyses = [
        {
          dataset_entry_id: "e2",
          commit_hash: "x2",
          status: "done",
          error: null,
        },
      ];
      probeRows.mockImplementation(async (sql: string, params: unknown[]) => {
        const entryIds = params[1] as string[] | undefined;
        if (sql.includes("DISTINCT")) return instances;
        let rows: { dataset_entry_id: string }[] = analyses;
        if (sql.includes("experiment_probe_outcome")) rows = outcomes;
        else if (sql.includes("experiment_probe_interval")) rows = intervals;
        return entryIds
          ? rows.filter((r) => entryIds.includes(r.dataset_entry_id))
          : rows;
      });
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }])
        .mockResolvedValueOnce([{ id: "e2", rank: 1, full_name: "octo/web" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() =>
        rowsBuilder(entries),
      );
      (
        service as unknown as {
          vulnerabilityRepository: { createQueryBuilder: jest.Mock };
        }
      ).vulnerabilityRepository.createQueryBuilder = vulnerabilityBuilder;

      const csv = (
        await read(
          (await service.exportFixesCsv("org-1", "exp-1", user)).stream,
        )
      ).split("\r\n");
      const { results } = await service.exportResults("org-1", "exp-1", user);

      const header = csv[0]!.split(",");
      const cell = (line: string, column: string): string =>
        line.split(",")[header.indexOf(column)]!;
      const fixLines = csv.slice(1, -1);
      expect(
        fixLines.map((line) => [
          Number(cell(line, "lag_days")),
          cell(line, "precision"),
        ]),
      ).toEqual(results.fix_lag.points.map((p) => [p.lag_days, p.precision]));
      expect(fixLines.map((line) => cell(line, "fix_commit"))).toEqual([
        "e5f",
        "x3",
      ]);
    });

    it("reports a fix its spent budget left unprobed as budget spent, at snapshot precision", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        id: "exp-1",
        name: "x",
        created_on: new Date(),
        analysis_budget: 2,
      });
      fixedLodash();
      probedLodash();
      const listed = probeRows.getMockImplementation()!;
      // d4e was never probed: the two snapshots spent the budget
      probeRows.mockImplementation(async (sql: string, params: unknown[]) => {
        if (sql.includes("SUM(attempts)")) return [{ submitted: "2" }];
        if (
          sql.includes("FROM experiment_probe\n") ||
          sql.includes("FROM experiment_probe\r")
        )
          return [];
        const rows = (await listed(sql, params)) as { commit_hash?: string }[];
        return sql.includes("experiment_probe_outcome")
          ? rows.filter((r) => r.commit_hash !== "d4e")
          : rows;
      });
      const entries = jest
        .fn()
        .mockResolvedValue([])
        .mockResolvedValueOnce([{ id: "e1", rank: 0, full_name: "octo/app" }]);
      runRepository["createQueryBuilder"]!.mockImplementation(() =>
        rowsBuilder(entries),
      );

      const fixes = await read(
        (await service.exportFixesCsv("org-1", "exp-1", user)).stream,
      );
      expect(fixes.split("\r\n")[1]).toBe(
        "0,octo/app,CVE-2021-23337,lodash,HIGH,2025-02-10,2025-03-28,e5f,upgraded,snapshot,not_found,budget spent,2025-03-01,HEAD,46",
      );
      const { results } = await service.exportResults("org-1", "exp-1", user);
      expect(results.probes.budget).toEqual({
        analysis_budget: 2,
        analyses_submitted: 2,
        spent: true,
      });
    });
  });

  describe("publish", () => {
    const completed = {
      id: "exp-1",
      name: "top100",
      status: "COMPLETED",
      created_on: new Date("2026-11-06T00:00:00Z"),
      started_on: new Date("2026-11-06T00:01:00Z"),
      ended_on: new Date("2026-11-06T02:00:00Z"),
      analyzer_steps: [[{ name: "js-sbom", version: "1.0.0" }]],
      provenance: { api_version: "0.0.49-alpha" },
      created_by: { first_name: "John", last_name: "Doe" },
    };

    /** A done HEAD run with one summary row and five vulnerabilities. */
    function doneRun(experiment: object = completed): void {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);
      runRepository["find"]!.mockResolvedValue([
        {
          id: "r1",
          status: "done",
          error: null,
          grid_date: null,
          branch: "main",
          commit_hash: "abc123",
          dataset_entry: { id: "e1", rank: 0, full_name: "lodash/lodash" },
        },
      ]);
      summaryRows.mockResolvedValue([
        {
          run_id: "r1",
          rank: 0,
          total_dependencies: 10,
          total_vulnerabilities: 5,
          package_manager: "NPM",
        },
      ]);
    }

    it("stores the complete results, intervals included, under the metric version", async () => {
      doneRun();

      const published = await service.publish("org-1", "exp-1", user);

      const stored = publishedRepository["save"]!.mock.calls[0]![0];
      expect(stored).toMatchObject({
        metric_version: 1,
        experiment: { id: "exp-1" },
        published_by: { id: "user-1" },
      });
      expect(stored.results.headline).toMatchObject({ n_projects: 1 });
      expect(stored.results.share_intervals).toBeDefined();
      expect(stored.results.bootstrap_intervals).not.toBeNull();
      expect(stored.results.bootstrap_intervals.headline).toBeDefined();
      expect(published).toMatchObject({ metric_version: 1 });
    });

    describe("replication package", () => {
      interface StoredPackage {
        package_archive: Buffer;
        package_checksum: string;
        results: object;
      }

      async function publishedRow(
        experiment: object = completed,
      ): Promise<StoredPackage> {
        doneRun(experiment);
        await service.publish("org-1", "exp-1", user);
        return publishedRepository["save"]!.mock.calls[0]![0];
      }

      it("freezes an archive of every listed file, recording its SHA-256", async () => {
        const stored = await publishedRow();

        expect([...unzip(stored.package_archive).keys()]).toEqual([
          "runs.csv",
          "vulnerabilities.csv",
          "exposures.csv",
          "fixes.csv",
          "results.json",
          "data_dictionary.md",
          "manifest.json",
          "CITATION.cff",
          "methods.md",
        ]);
        expect(stored.package_checksum).toBe(
          createHash("sha256").update(stored.package_archive).digest("hex"),
        );
      });

      it("describes every column of every exported CSV in the data dictionary", async () => {
        const files = unzip((await publishedRow()).package_archive);
        const dictionary = files.get("data_dictionary.md")!;

        for (const file of [
          "runs.csv",
          "vulnerabilities.csv",
          "exposures.csv",
          "fixes.csv",
        ]) {
          const section = dictionary.split(`## ${file}`)[1]!.split("\n## ")[0]!;
          const described = [
            ...section.matchAll(/^\| `([^`]+)` \| \S.* \|$/gm),
          ].map((row) => row[1]);
          const columns = files.get(file)!.split("\r\n")[0]!.split(",");
          expect(described).toEqual(expect.arrayContaining(columns));
        }
      });

      describe("citation file", () => {
        beforeEach(() => {
          jest.useFakeTimers({
            now: new Date("2026-11-07T10:00:00Z"),
            doNotFake: ["nextTick", "setImmediate", "queueMicrotask"],
          });
        });
        afterEach(() => jest.useRealTimers());

        it("cites the Published results version, escaping the experiment name", async () => {
          const stored = await publishedRow({
            ...completed,
            name: 'Top: "100"',
          });

          expect(unzip(stored.package_archive).get("CITATION.cff")).toBe(
            [
              'cff-version: "1.2.0"',
              'message: "If you use this data, please cite it using these metadata."',
              'type: "dataset"',
              'title: "Top: \\"100\\" (replication package, metric version 1)"',
              'version: "1"',
              'date-released: "2026-11-07"',
              "authors:",
              '  - family-names: "Doe"',
              '    given-names: "John"',
              "",
            ].join("\n"),
          );
        });

        it("names no person when the experiment has no recorded creator", async () => {
          const stored = await publishedRow({
            ...completed,
            name: "top100",
            created_by: null,
          });

          expect(unzip(stored.package_archive).get("CITATION.cff")).toContain(
            'authors:\n  - name: "Author not recorded"\n',
          );
        });
      });

      describe("methods text", () => {
        async function methodsOf(
          experiment: object = completed,
        ): Promise<string> {
          experimentRepository["findOne"]!.mockResolvedValue(experiment);
          await service.publish("org-1", "exp-1", user);
          const stored = publishedRepository["save"]!.mock.calls[0]![0];
          return unzip(stored.package_archive).get("methods.md")!;
        }

        const run = (
          id: string,
          status: string,
          gridDate: string | null,
          error: string | null = null,
          knowledge: object | null = null,
        ): object => ({
          id,
          status,
          error,
          grid_index: gridDate ? 0 : 1,
          grid_date: gridDate ? new Date(`${gridDate}T00:00:00Z`) : null,
          knowledge,
          shared_from: null,
          dataset_entry: { id: id },
        });

        /** One done project with two instances on two packages at HEAD. */
        function twoInstances(): void {
          doneRun();
          const instance = (dependency: string): object => ({
            run_id: "r1",
            affected_dependency: dependency,
            vulnerability_id: "CVE-2021-23337",
            severity_class: "HIGH",
            epss_score: null,
            conflict_flag: "MATCH_CORRECT",
            winning_source: "OSV",
            withdrawn_date: null,
          });
          vulnerabilityRows.mockResolvedValue([
            instance("lodash"),
            instance("minimist"),
          ]);
        }

        it("describes the study from the experiment's data", async () => {
          fixedLodash();

          expect(await methodsOf()).toContain(
            "The analyzer (js-sbom 1.0.0) ran over every snapshot of the dataset entries (n = 1): 1 grid date from 2025-03-01 to 2025-03-01, plus HEAD. There were 2 experiment runs.",
          );
        });

        it("gives the top-10 concentration with its interval and both caveats", async () => {
          twoInstances();

          const text = await methodsOf();

          // Wilson with p = 1 has low = n / (n + z^2): 2 / 5.8415
          expect(text).toContain(
            "At HEAD, the 10 most affected packages hold 100.0% of vulnerability instances (95% interval 34.2% to 100.0%).",
          );
          expect(text).toContain(
            "These top-10 concentration intervals treat vulnerability instances as independent, and the top 10 are chosen after seeing the data.",
          );
        });

        it("omits top-10 figures when there are no instances to rank", async () => {
          doneRun();

          expect(await methodsOf()).toContain(
            "No vulnerability instances were observed at HEAD, so top-10 concentration does not apply.",
          );
        });

        it("states the bootstrap method, resamples and seed", async () => {
          doneRun();

          expect(await methodsOf()).toContain(
            "Medians and Gini coefficients use a percentile bootstrap, resampling by project, with 95% confidence, 10000 resamples and seed 20260611.",
          );
        });

        it("states the ethics statement and nothing about venue rules", async () => {
          doneRun();

          const text = await methodsOf();

          expect(text).toContain(
            "Only already-public advisories on public repositories are reported.",
          );
          expect(text).not.toMatch(/venue|journal|conference/i);
        });

        it("states how many fixes are dated only to a snapshot interval", async () => {
          fixedLodash();

          expect(await methodsOf()).toContain(
            "Of all fixes (n = 1), 1 (100.0%) are dated only to a snapshot interval.",
          );
        });

        it("reports fix dating from the data once a probe dates the fix", async () => {
          fixedLodash();
          probedLodash();

          expect(await methodsOf()).toContain(
            "Of all fixes (n = 1), 0 (0.0%) are dated only to a snapshot interval.",
          );
        });

        it("says when an experiment has no fixes to date", async () => {
          doneRun();

          expect(await methodsOf()).toContain(
            "No fixes were observed, so fix dating does not apply.",
          );
        });

        it("reports failed and skipped runs, with the reasons at HEAD", async () => {
          runRepository["find"]!.mockResolvedValue([
            run("a", "done", "2025-03-01"),
            run("b", "skipped", "2025-03-01", "no default branch"),
            run("c", "failed", null, "clone timed out"),
          ]);

          const text = await methodsOf();

          expect(text).toContain(
            "At HEAD, 0 of 1 experiment runs ended done, 1 failed and 0 were skipped.",
          );
          expect(text).toContain(
            "Failure reasons at HEAD: clone timed out (1).",
          );
          expect(text).toContain(
            "Over all 3 experiment runs of the snapshot grid, 1 failed and 1 were skipped; 0 done runs were empty because the snapshot had no lockfile yet.",
          );
        });

        it("leaves mixed knowledge out when knowledge did not change", async () => {
          doneRun();

          expect(await methodsOf()).not.toContain("Mixed knowledge");
        });

        it("states mixed knowledge when the start and end stamps differ", async () => {
          doneRun();

          const text = await methodsOf({
            ...completed,
            provenance: {
              knowledge_start: {
                knowledge_sources: { nvd: "2026-11-01" },
                epss_rows: 10,
              },
              knowledge_end: {
                knowledge_sources: { nvd: "2026-11-02" },
                epss_rows: 10,
              },
            },
          });

          expect(text).toContain(
            "**Mixed knowledge.** The knowledge changed during the experiment, from nvd 2026-11-01 (10 EPSS rows) to nvd 2026-11-02 (10 EPSS rows).",
          );
        });

        it("names the grid dates whose runs were matched against different knowledge", async () => {
          const stamp = (day: string): object => ({
            knowledge_sources: { osv: day },
            epss_rows: 1,
          });
          runRepository["find"]!.mockResolvedValue([
            run("a", "done", "2025-03-01", null, stamp("2025-03-01")),
            run("b", "done", "2025-03-01", null, stamp("2025-03-02")),
          ]);

          expect(await methodsOf()).toContain(
            "**Mixed knowledge.** Experiment runs were matched against different knowledge at these snapshots: 2025-03-01.",
          );
        });
      });

      it("records every provenance field in the manifest", async () => {
        const stored = await publishedRow({
          ...completed,
          name: "top100",
          provenance: {
            api_version: "0.0.49-alpha",
            knowledge_start: {
              knowledge_sources: { nvd: "2026-11-01" },
              epss_rows: 10,
            },
            knowledge_end: {
              knowledge_sources: { nvd: "2026-11-02" },
              epss_rows: 12,
            },
          },
        });

        const manifest = JSON.parse(
          unzip(stored.package_archive).get("manifest.json")!,
        );

        expect(manifest).toMatchObject({
          experiment_id: "exp-1",
          experiment_name: "top100",
          metric_version: 1,
          api_version: "0.0.49-alpha",
          analyzer_steps: [[{ name: "js-sbom", version: "1.0.0" }]],
          knowledge_start: {
            knowledge_sources: { nvd: "2026-11-01" },
            epss_rows: 10,
          },
          knowledge_end: {
            knowledge_sources: { nvd: "2026-11-02" },
            epss_rows: 12,
          },
          knowledge_changed: true,
          bootstrap: { seed: 20_260_611, resamples: 10_000 },
          commits: [
            {
              rank: 0,
              full_name: "lodash/lodash",
              grid_date: "HEAD",
              status: "done",
              branch: "main",
              commit_hash: "abc123",
            },
          ],
        });
      });

      it("downloads the frozen bytes, unchanged by later data or metric changes", async () => {
        const stored = await publishedRow();
        publishedRepository["findOne"]!.mockResolvedValue(stored);

        const first = await service.getPublishedPackage(
          "org-1",
          "exp-1",
          1,
          user,
        );
        fixedLodash();
        runRepository["createQueryBuilder"]!.mockImplementation(() => {
          throw new Error("a download must not read the rows");
        });
        const second = await service.getPublishedPackage(
          "org-1",
          "exp-1",
          1,
          user,
        );

        const digest = (bytes: Buffer): string =>
          createHash("sha256").update(bytes).digest("hex");
        expect(digest(first.archive)).toBe(stored.package_checksum);
        expect(digest(second.archive)).toBe(stored.package_checksum);
      });

      it("answers not found for a version without a package", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(completed);
        publishedRepository["findOne"]!.mockResolvedValue({
          metric_version: 1,
          package_archive: null,
        });

        await expect(
          service.getPublishedPackage("org-1", "exp-1", 1, user),
        ).rejects.toBeInstanceOf(EntityNotFound);
      });

      it("hides the package from non-members", async () => {
        hasRequiredRole.mockRejectedValue(new NotAuthorized());

        await expect(
          service.getPublishedPackage("org-1", "exp-1", 1, user),
        ).rejects.toBeInstanceOf(NotAuthorized);
        expect(publishedRepository["findOne"]).not.toHaveBeenCalled();
      });

      it("publishes nothing when a file of the package cannot be read", async () => {
        doneRun();
        vulnerabilityRows.mockRejectedValue(new Error("connection lost"));

        await expect(service.publish("org-1", "exp-1", user)).rejects.toThrow(
          "connection lost",
        );
        expect(publishedRepository["save"]).not.toHaveBeenCalled();
      });

      it("packs the results as stored and the CSVs as exported", async () => {
        const stored = await publishedRow();
        const files = unzip(stored.package_archive);

        expect(JSON.parse(files.get("results.json")!)).toEqual(
          JSON.parse(JSON.stringify(stored.results)),
        );
        expect(files.get("fixes.csv")).toBe(
          "rank,full_name,vulnerability_id,affected_dependency,severity,published_date,fix_date,fix_commit,fix_kind,precision,probe_outcome,probe_reason,interval_from,interval_to,lag_days\r\n",
        );
      });
    });

    describe("versions", () => {
      it("lists versions newest first without loading their payloads", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(completed);
        const on = new Date("2026-11-07T00:00:00Z");
        publishedRepository["find"]!.mockResolvedValue([
          {
            metric_version: 2,
            published_on: on,
            published_by: { first_name: "Jane", last_name: "Roe" },
          },
          { metric_version: 1, published_on: on, published_by: null },
        ]);

        const versions = await service.listPublished("org-1", "exp-1", user);

        expect(versions).toEqual([
          {
            metric_version: 2,
            published_on: on,
            published_by_name: "Jane Roe",
            package_checksum: null,
          },
          {
            metric_version: 1,
            published_on: on,
            published_by_name: null,
            package_checksum: null,
          },
        ]);
        const query = publishedRepository["find"]!.mock.calls[0]![0];
        expect(query.select.results).toBeUndefined();
        expect(query.order).toEqual({ metric_version: "DESC" });
        expect(hasRequiredRole).toHaveBeenCalledWith(
          "org-1",
          "user-1",
          MemberRole.USER,
        );
      });

      it("reads one stored version", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(completed);
        const frozen = { headline: { n_projects: 7 } };
        publishedRepository["findOne"]!.mockResolvedValue({
          metric_version: 1,
          results: frozen,
        });

        expect(await service.getPublished("org-1", "exp-1", 1, user)).toEqual(
          frozen,
        );
        expect(publishedRepository["findOne"]).toHaveBeenCalledWith({
          where: { experiment: { id: "exp-1" }, metric_version: 1 },
        });
      });

      describe("exporting one version", () => {
        const stored = (
          metric_version: number,
          n_projects: number,
        ): object => ({
          metric_version,
          results: { headline: { n_projects } },
        });

        it("serves results.json of the requested version, not the newest", async () => {
          experimentRepository["findOne"]!.mockResolvedValue(completed);
          publishedRepository["findOne"]!.mockImplementation(
            async ({ where }: { where: { metric_version?: number } }) =>
              where.metric_version === 1 ? stored(1, 7) : stored(2, 9),
          );

          const { results } = await service.exportResults(
            "org-1",
            "exp-1",
            user,
            1,
          );

          expect(results.headline.n_projects).toBe(7);
        });

        it("answers not found for a version the experiment does not have", async () => {
          experimentRepository["findOne"]!.mockResolvedValue(completed);
          publishedRepository["findOne"]!.mockResolvedValue(null);

          await expect(
            service.exportResults("org-1", "exp-1", user, 5),
          ).rejects.toBeInstanceOf(EntityNotFound);
        });

        it("serves a CSV as frozen in that version's package", async () => {
          experimentRepository["findOne"]!.mockResolvedValue(completed);
          const { archive } = await buildReplicationPackage([
            { name: "results.json", open: () => "{}" },
            { name: "runs.csv", open: () => "rank\r\n1\r\n" },
          ]);
          publishedRepository["findOne"]!.mockResolvedValue({
            package_archive: archive,
          });

          const { stream } = await service.exportRunsCsv(
            "org-1",
            "exp-1",
            user,
            1,
          );

          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(chunk as Buffer);
          expect(Buffer.concat(chunks).toString()).toBe("rank\r\n1\r\n");
        });

        it("answers not found for a CSV of a version without a package", async () => {
          experimentRepository["findOne"]!.mockResolvedValue(completed);
          publishedRepository["findOne"]!.mockResolvedValue({
            package_archive: null,
          });

          await expect(
            service.exportFixesCsv("org-1", "exp-1", user, 1),
          ).rejects.toBeInstanceOf(EntityNotFound);
        });
      });

      it("answers not found for a version never published", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(completed);

        await expect(
          service.getPublished("org-1", "exp-1", 5, user),
        ).rejects.toBeInstanceOf(EntityNotFound);
      });
    });

    describe("versions side by side", () => {
      /** Holds saved versions, as the table does, one row per metric version. */
      function storeVersions(): void {
        const rows: { metric_version: number; results: unknown }[] = [];
        const matching = (where: { metric_version?: number }): typeof rows =>
          rows
            .filter(
              (row) =>
                where.metric_version === undefined ||
                row.metric_version === where.metric_version,
            )
            .sort((a, b) => b.metric_version - a.metric_version);
        publishedRepository["save"]!.mockImplementation(
          (row: (typeof rows)[number]) => {
            rows.push(row);
            return Promise.resolve(row);
          },
        );
        publishedRepository["exists"]!.mockImplementation(
          ({ where }: { where: { metric_version?: number } }) =>
            Promise.resolve(matching(where).length > 0),
        );
        publishedRepository["findOne"]!.mockImplementation(
          ({ where }: { where: { metric_version?: number } }) =>
            Promise.resolve(matching(where)[0] ?? null),
        );
        publishedRepository["find"]!.mockImplementation(() =>
          Promise.resolve(
            matching({}).map((row) => ({ ...row, published_by: null })),
          ),
        );
      }

      it("adds a new version after a bump and leaves the old one identical", async () => {
        doneRun();
        storeVersions();
        await service.publish("org-1", "exp-1", user);
        const before = JSON.stringify(
          await service.getPublished("org-1", "exp-1", 1, user),
        );

        // The metric fix: same experiment, different output, new version
        summaryRows.mockResolvedValue([
          {
            run_id: "r1",
            rank: 0,
            total_dependencies: 20,
            total_vulnerabilities: 9,
            package_manager: "NPM",
          },
        ]);
        mockMetricVersion = 2;
        const second = await service.publish("org-1", "exp-1", user);

        expect(second).toMatchObject({ metric_version: 2 });
        expect(
          JSON.stringify(await service.getPublished("org-1", "exp-1", 1, user)),
        ).toBe(before);
        expect(
          JSON.stringify(await service.getPublished("org-1", "exp-1", 2, user)),
        ).not.toBe(before);
        const versions = await service.listPublished("org-1", "exp-1", user);
        expect(versions.map((version) => version.metric_version)).toEqual([
          2, 1,
        ]);
      });

      it("still refuses a repeat publish once the new version is stored", async () => {
        doneRun();
        storeVersions();
        mockMetricVersion = 2;
        await service.publish("org-1", "exp-1", user);

        await expect(
          service.publish("org-1", "exp-1", user),
        ).rejects.toBeInstanceOf(ExperimentAlreadyPublished);
      });
    });

    describe("the current metric version", () => {
      it("tells a member which version a publish would store", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(completed);
        mockMetricVersion = 4;

        await expect(
          service.currentMetricVersion("org-1", "exp-1", user),
        ).resolves.toEqual({ metric_version: 4 });
        expect(hasRequiredRole).toHaveBeenCalledWith(
          "org-1",
          "user-1",
          MemberRole.USER,
        );
      });

      it("answers not found for another org's experiment", async () => {
        experimentRepository["findOne"]!.mockResolvedValue(null);

        await expect(
          service.currentMetricVersion("org-1", "exp-1", user),
        ).rejects.toBeInstanceOf(EntityNotFound);
      });
    });

    it("stores the mixed knowledge warning and still publishes", async () => {
      doneRun();
      const knowledge = (nvd: string): object => ({
        knowledge_sources: { nvd },
        epss_rows: 5,
      });
      experimentRepository["findOne"]!.mockResolvedValue({
        ...completed,
        provenance: {
          knowledge_start: knowledge("2026-11-05T00:00:00Z"),
          knowledge_end: knowledge("2026-11-06T01:00:00Z"),
        },
      });

      await service.publish("org-1", "exp-1", user);

      const stored = publishedRepository["save"]!.mock.calls[0]![0];
      expect(stored.results.provenance.knowledge_changed).toBe(true);
    });

    describe("once published", () => {
      /** Stored numbers no computation over the mocked rows could produce. */
      const frozen = { headline: { n_projects: 999 } };

      it("serves results and results.json from storage, even though metric output would now differ", async () => {
        doneRun();
        publishedRepository["findOne"]!.mockResolvedValue({
          metric_version: 1,
          results: frozen,
        });

        expect(await service.getResults("org-1", "exp-1", user)).toEqual(
          frozen,
        );
        const exported = await service.exportResults("org-1", "exp-1", user);

        expect(exported.results).toEqual(frozen);
        expect(publishedRepository["findOne"]).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { experiment: { id: "exp-1" } },
            order: { metric_version: "DESC" },
          }),
        );
        expect(runRepository["find"]).not.toHaveBeenCalled();
      });

      it("keeps computing on read while nothing is published", async () => {
        doneRun();

        const results = await service.getResults("org-1", "exp-1", user);

        expect(results.headline.n_projects).toBe(1);
      });
    });

    it("refuses a second publish under the same metric version without running the bootstrap", async () => {
      doneRun();
      publishedRepository["exists"]!.mockResolvedValue(true);

      await expect(
        service.publish("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(ExperimentAlreadyPublished);

      expect(publishedRepository["exists"]).toHaveBeenCalledWith({
        where: { experiment: { id: "exp-1" }, metric_version: 1 },
      });
      expect(runRepository["find"]).not.toHaveBeenCalled();
      expect(publishedRepository["save"]).not.toHaveBeenCalled();
    });

    it("reports a concurrent publish that lost the unique constraint as already published", async () => {
      doneRun();
      publishedRepository["save"]!.mockRejectedValue(
        Object.assign(new QueryFailedError("INSERT", [], new Error("dup")), {
          code: "23505",
        }),
      );

      await expect(
        service.publish("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(ExperimentAlreadyPublished);
    });

    it("does not hide other storage failures", async () => {
      doneRun();
      publishedRepository["save"]!.mockRejectedValue(new Error("disk full"));

      await expect(service.publish("org-1", "exp-1", user)).rejects.toThrow(
        "disk full",
      );
    });

    it.each(["PENDING", "RUNNING", "CANCELLED", "FAILED"])(
      "refuses a %s experiment",
      async (status) => {
        doneRun();
        experimentRepository["findOne"]!.mockResolvedValue({
          ...completed,
          status,
        });

        await expect(
          service.publish("org-1", "exp-1", user),
        ).rejects.toBeInstanceOf(ExperimentNotPublishable);

        expect(publishedRepository["save"]).not.toHaveBeenCalled();
      },
    );

    it("refuses a COMPLETED experiment with no end time, as its intervals would be missing", async () => {
      doneRun();
      experimentRepository["findOne"]!.mockResolvedValue({
        ...completed,
        ended_on: null,
      });

      await expect(
        service.publish("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(ExperimentNotPublishable);
    });

    it("refuses a non-admin before computing anything", async () => {
      doneRun();
      hasRequiredRole.mockRejectedValue(new NotAuthorized());

      await expect(
        service.publish("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(NotAuthorized);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(publishedRepository["save"]).not.toHaveBeenCalled();
    });
  });
});
