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

  /** A query builder whose chained calls return itself, ending in rows. */
  function rowsBuilder(getRawMany: jest.Mock): Record<string, jest.Mock> {
    const builder: Record<string, jest.Mock> = { getRawMany };
    for (const method of ["select", "addSelect", "innerJoin", "where"]) {
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
    );
  });

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
  });
});
