import { type AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import {
  AlreadyExists,
  EntityNotFound,
  NotAuthorized,
} from "src/types/error.types";

import { DatasetStatus } from "../datasets/dataset.entity";

import { ExperimentStatus } from "./experiment.entity";
import { ExperimentRunStatus } from "./experiment-run.entity";
import { type ExperimentRunnerService } from "./experiment-runner.service";
import {
  AnalyzerMissingRequiredPlugins,
  DatasetNotReady,
  ExperimentNotCancellable,
} from "./experiments.errors";
import { ExperimentsService } from "./experiments.service";

const steps = (...names: string[]): object[][] => [
  names.map((name) => ({ name, version: "1.0.0", config: {} })),
];

describe("ExperimentsService", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  const body = {
    name: "  top100-head ",
    dataset_id: "ds-1",
    analyzer_id: "an-1",
  };
  let service: ExperimentsService;
  let hasRequiredRole: jest.Mock;
  let analyzersRepository: Record<string, jest.Mock>;
  let experimentRepository: Record<string, jest.Mock>;
  let runRepository: Record<string, jest.Mock>;
  let datasetRepository: Record<string, jest.Mock>;
  let entryRepository: Record<string, jest.Mock>;
  let runner: { kick: jest.Mock; cancel: jest.Mock };
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
    analyzersRepository = {
      doesAnalyzerBelongToOrg: jest.fn().mockResolvedValue(undefined),
      getAnalyzerById: jest.fn().mockResolvedValue({
        id: "an-1",
        steps: [...steps("js-sbom"), ...steps("vuln-finder", "license-finder")],
      }),
    };
    experimentRepository = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((value: unknown) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ ...value, id: "exp-1" }),
      ),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const countBuilder: Record<string, jest.Mock> = {
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    for (const method of [
      "select",
      "addSelect",
      "where",
      "groupBy",
      "addGroupBy",
    ]) {
      countBuilder[method] = jest.fn().mockReturnValue(countBuilder);
    }
    runRepository = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(countBuilder),
    };
    datasetRepository = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: "ds-1", status: DatasetStatus.READY }),
    };
    entryRepository = {
      find: jest.fn().mockResolvedValue([{ id: "e-0" }, { id: "e-1" }]),
    };

    runner = { kick: jest.fn(), cancel: jest.fn().mockResolvedValue(true) };
    summaryRows = jest.fn().mockResolvedValue([]);
    vulnerabilityRows = jest.fn().mockResolvedValue([]);
    service = new ExperimentsService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      analyzersRepository as unknown as AnalyzersRepository,
      experimentRepository as never,
      runRepository as never,
      datasetRepository as never,
      entryRepository as never,
      runner as unknown as ExperimentRunnerService,
      {
        createQueryBuilder: jest.fn(() => rowsBuilder(summaryRows)),
      } as never,
      {
        createQueryBuilder: jest.fn(() => rowsBuilder(vulnerabilityRows)),
      } as never,
    );
  });

  describe("create", () => {
    it("requires an admin and creates a pending run per dataset entry", async () => {
      const id = await service.create("org-1", body, user);

      expect(id).toBe("exp-1");
      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(experimentRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "top100-head",
          status: ExperimentStatus.PENDING,
          retries: 2,
          organization: { id: "org-1" },
          created_by: { id: "user-1" },
          dataset: { id: "ds-1" },
          analyzer: { id: "an-1" },
          runs: [
            {
              status: ExperimentRunStatus.PENDING,
              attempts: 0,
              dataset_entry: { id: "e-0" },
            },
            {
              status: ExperimentRunStatus.PENDING,
              attempts: 0,
              dataset_entry: { id: "e-1" },
            },
          ],
        }),
      );
    });

    it("wakes the runner up", async () => {
      await service.create("org-1", body, user);
      expect(runner.kick).toHaveBeenCalled();
    });

    it("keeps the requested retries", async () => {
      await service.create("org-1", { ...body, retries: 0 }, user);

      expect(experimentRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({ retries: 0 }),
      );
    });

    it("looks the dataset up within the organization", async () => {
      datasetRepository["findOne"]!.mockResolvedValue(null);

      await expect(service.create("org-1", body, user)).rejects.toBeInstanceOf(
        EntityNotFound,
      );
      expect(datasetRepository["findOne"]).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ds-1", organization: { id: "org-1" } },
        }),
      );
      expect(experimentRepository["save"]).not.toHaveBeenCalled();
    });

    it.each([DatasetStatus.BUILDING, DatasetStatus.FAILED])(
      "refuses a %s dataset",
      async (status) => {
        datasetRepository["findOne"]!.mockResolvedValue({ id: "ds-1", status });

        await expect(
          service.create("org-1", body, user),
        ).rejects.toBeInstanceOf(DatasetNotReady);
        expect(experimentRepository["save"]).not.toHaveBeenCalled();
      },
    );

    it("refuses an analyzer of another organization", async () => {
      analyzersRepository["doesAnalyzerBelongToOrg"]!.mockRejectedValue(
        new NotAuthorized(),
      );

      await expect(service.create("org-1", body, user)).rejects.toBeInstanceOf(
        NotAuthorized,
      );
      expect(
        analyzersRepository["doesAnalyzerBelongToOrg"],
      ).toHaveBeenCalledWith("an-1", "org-1");
      expect(experimentRepository["save"]).not.toHaveBeenCalled();
    });

    it.each([
      [steps("js-sbom", "license-finder")],
      [steps("vuln-finder")],
      [steps("php-sbom", "vuln-finder")],
    ])("refuses an analyzer without js-sbom and vuln-finder: %j", async (s) => {
      analyzersRepository["getAnalyzerById"]!.mockResolvedValue({
        id: "an-1",
        steps: s,
      });

      await expect(service.create("org-1", body, user)).rejects.toBeInstanceOf(
        AnalyzerMissingRequiredPlugins,
      );
      expect(experimentRepository["save"]).not.toHaveBeenCalled();
    });

    it("refuses a name already used in the organization", async () => {
      experimentRepository["exists"]!.mockResolvedValue(true);

      await expect(service.create("org-1", body, user)).rejects.toBeInstanceOf(
        AlreadyExists,
      );
      expect(experimentRepository["exists"]).toHaveBeenCalledWith({
        where: { organization: { id: "org-1" }, name: "top100-head" },
      });
      expect(experimentRepository["save"]).not.toHaveBeenCalled();
    });

    it("stops when the membership check fails", async () => {
      hasRequiredRole.mockRejectedValue(new NotAuthorized());

      await expect(service.create("org-1", body, user)).rejects.toBeInstanceOf(
        NotAuthorized,
      );
      expect(experimentRepository["save"]).not.toHaveBeenCalled();
    });
  });

  describe("reads", () => {
    const experiment = {
      id: "exp-1",
      name: "top100-head",
      status: ExperimentStatus.RUNNING,
      retries: 2,
      error: null,
      analyzer_steps: null,
      created_on: new Date("2026-11-06T00:00:00Z"),
      started_on: new Date("2026-11-06T00:01:00Z"),
      ended_on: null,
      created_by: { first_name: "John", last_name: "Doe" },
      dataset: { id: "ds-1", name: "top100" },
      analyzer: { id: "an-1", name: "JS" },
    };

    it("get requires membership and reports runs per state", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);
      runRepository["createQueryBuilder"]!().getRawMany.mockResolvedValue([
        { experiment_id: "exp-1", status: "pending", count: "90" },
        { experiment_id: "exp-1", status: "done", count: "7" },
        { experiment_id: "exp-1", status: "skipped", count: "3" },
      ]);

      const summary = await service.get("org-1", "exp-1", user);

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
      expect(summary).toMatchObject({
        id: "exp-1",
        name: "top100-head",
        status: ExperimentStatus.RUNNING,
        retries: 2,
        dataset_id: "ds-1",
        dataset_name: "top100",
        analyzer_id: "an-1",
        analyzer_name: "JS",
        created_by_name: "John Doe",
        run_count: 100,
        run_counts: { pending: 90, done: 7, failed: 0, skipped: 3 },
      });
    });

    it("get hides experiments of other organizations", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(null);

      await expect(service.get("org-1", "exp-9", user)).rejects.toBeInstanceOf(
        EntityNotFound,
      );
    });

    it("getMany lists the organization's experiments, newest first", async () => {
      experimentRepository["findAndCount"]!.mockResolvedValue([
        [experiment],
        21,
      ]);

      const page = await service.getMany(
        "org-1",
        { currentPage: 1, entriesPerPage: 20 },
        user,
      );

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.USER,
      );
      expect(experimentRepository["findAndCount"]).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization: { id: "org-1" } },
          order: { created_on: "DESC" },
          skip: 20,
          take: 20,
        }),
      );
      expect(page).toMatchObject({
        page: 1,
        total_entries: 21,
        total_pages: 2,
        data: [{ id: "exp-1", run_count: 0 }],
      });
    });

    it("getRuns pages through the runs by entry rank", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);
      runRepository["findAndCount"]!.mockResolvedValue([
        [
          {
            id: "run-1",
            status: ExperimentRunStatus.DONE,
            error: null,
            attempts: 1,
            branch: "main",
            commit_hash: "abc123",
            committed_at: new Date("2026-11-01T00:00:00Z"),
            submitted_on: null,
            ended_on: null,
            dataset_entry: {
              id: "e-0",
              rank: 0,
              full_name: "react/react",
              git_url: "https://github.com/react/react",
              stars: 100,
            },
            analysis: { id: "a-1", project: { id: "p-1" } },
          },
        ],
        250,
      ]);

      const page = await service.getRuns(
        "org-1",
        "exp-1",
        { currentPage: 2, entriesPerPage: 100 },
        user,
      );

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.USER,
      );
      expect(runRepository["findAndCount"]).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { experiment: { id: "exp-1" } },
          order: { dataset_entry: { rank: "ASC" } },
          skip: 200,
          take: 100,
        }),
      );
      expect(page).toMatchObject({
        page: 2,
        total_entries: 250,
        total_pages: 3,
        data: [
          {
            id: "run-1",
            status: ExperimentRunStatus.DONE,
            attempts: 1,
            branch: "main",
            commit_hash: "abc123",
            analysis_id: "a-1",
            project_id: "p-1",
            entry: {
              id: "e-0",
              rank: 0,
              full_name: "react/react",
              git_url: "https://github.com/react/react",
              stars: 100,
            },
          },
        ],
      });
    });

    it("getRuns hides experiments of other organizations", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(null);

      await expect(
        service.getRuns("org-1", "exp-9", {}, user),
      ).rejects.toBeInstanceOf(EntityNotFound);
      expect(runRepository["findAndCount"]).not.toHaveBeenCalled();
    });
  });

  describe("delete", () => {
    it("requires an admin and deletes only within the organization", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1" });

      await service.delete("org-1", "exp-1", user);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(experimentRepository["delete"]).toHaveBeenCalledWith({
        id: "exp-1",
      });
    });

    it("refuses an experiment of another organization", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(null);

      await expect(
        service.delete("org-1", "exp-9", user),
      ).rejects.toBeInstanceOf(EntityNotFound);
      expect(experimentRepository["delete"]).not.toHaveBeenCalled();
    });
  });
  describe("cancel", () => {
    it("requires an admin and hands the experiment to the runner", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1" });

      await service.cancel("org-1", "exp-1", user);

      expect(hasRequiredRole).toHaveBeenCalledWith(
        "org-1",
        "user-1",
        MemberRole.ADMIN,
      );
      expect(runner.cancel).toHaveBeenCalledWith("exp-1");
    });

    it("refuses an experiment that already ended", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1" });
      runner.cancel.mockResolvedValue(false);

      await expect(
        service.cancel("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(ExperimentNotCancellable);
    });

    it("refuses an experiment of another organization", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(null);

      await expect(
        service.cancel("org-1", "exp-9", user),
      ).rejects.toBeInstanceOf(EntityNotFound);
      expect(runner.cancel).not.toHaveBeenCalled();
    });
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
});
