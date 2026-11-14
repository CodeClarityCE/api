import { type AnalyzersRepository } from "src/base_modules/analyzers/analyzers.repository";
import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import {
  AlreadyExists,
  EntityInUse,
  EntityNotFound,
  NotAuthorized,
} from "src/types/error.types";

import { DatasetStatus } from "../datasets/dataset.entity";

import { ExperimentStatus } from "./experiment.entity";
import { GridInterval } from "./experiment-grid";
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
  let publishedRepository: Record<string, jest.Mock>;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-07T15:00:00Z") });
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
    publishedRepository = { exists: jest.fn().mockResolvedValue(false) };
    service = new ExperimentsService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      analyzersRepository as unknown as AnalyzersRepository,
      experimentRepository as never,
      runRepository as never,
      datasetRepository as never,
      entryRepository as never,
      runner as unknown as ExperimentRunnerService,
      publishedRepository as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("create", () => {
    it("requires an admin and creates a pending run per snapshot of every entry, HEAD last", async () => {
      const id = await service.create(
        "org-1",
        { ...body, grid_interval: GridInterval.MONTH, grid_count: 2 },
        user,
      );

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
          grid_interval: "month",
          grid_count: 2,
          runs: ["e-0", "e-1"].flatMap((entryId) =>
            [
              [0, new Date("2026-09-07T00:00:00Z")],
              [1, new Date("2026-10-07T00:00:00Z")],
              [2, null],
            ].map(([gridIndex, gridDate]) => ({
              status: ExperimentRunStatus.PENDING,
              attempts: 0,
              grid_index: gridIndex,
              grid_date: gridDate,
              dataset_entry: { id: entryId },
            })),
          ),
        }),
      );
    });

    it("defaults the grid to monthly x 24 plus HEAD", async () => {
      await service.create("org-1", body, user);

      const saved = experimentRepository["save"]!.mock.calls[0]![0] as {
        grid_interval: string;
        grid_count: number;
        runs: { grid_index: number; grid_date: Date | null }[];
      };
      expect(saved.grid_interval).toBe("month");
      expect(saved.grid_count).toBe(24);
      expect(saved.runs).toHaveLength(2 * 25);
      expect(saved.runs[0]).toMatchObject({
        grid_index: 0,
        grid_date: new Date("2024-11-07T00:00:00Z"),
      });
      expect(saved.runs[24]).toMatchObject({ grid_index: 24, grid_date: null });
    });

    it("steps weekly grids back by seven days", async () => {
      await service.create(
        "org-1",
        { ...body, grid_interval: GridInterval.WEEK, grid_count: 2 },
        user,
      );

      const saved = experimentRepository["save"]!.mock.calls[0]![0] as {
        runs: { grid_date: Date | null }[];
      };
      expect(saved.runs.slice(0, 3).map((run) => run.grid_date)).toEqual([
        new Date("2026-10-24T00:00:00Z"),
        new Date("2026-10-31T00:00:00Z"),
        null,
      ]);
    });

    it("clamps monthly grid dates to the end of shorter months", async () => {
      jest.setSystemTime(new Date("2026-03-31T09:00:00Z"));
      await service.create(
        "org-1",
        { ...body, grid_interval: GridInterval.MONTH, grid_count: 2 },
        user,
      );

      const saved = experimentRepository["save"]!.mock.calls[0]![0] as {
        runs: { grid_date: Date | null }[];
      };
      expect(saved.runs.slice(0, 2).map((run) => run.grid_date)).toEqual([
        new Date("2026-01-31T00:00:00Z"),
        new Date("2026-02-28T00:00:00Z"),
      ]);
    });

    it("creates a HEAD-only grid for a count of 0", async () => {
      await service.create("org-1", { ...body, grid_count: 0 }, user);

      const saved = experimentRepository["save"]!.mock.calls[0]![0] as {
        runs: { grid_index: number; grid_date: Date | null }[];
      };
      expect(saved.runs).toEqual([
        expect.objectContaining({ grid_index: 0, grid_date: null }),
        expect.objectContaining({ grid_index: 0, grid_date: null }),
      ]);
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

    it("freezes the analysis budget given at creation", async () => {
      await service.create("org-1", { ...body, analysis_budget: 500 }, user);

      expect(experimentRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({ analysis_budget: 500 }),
      );
    });

    it("creates an experiment without a budget by default", async () => {
      await service.create("org-1", body, user);

      expect(experimentRepository["save"]).toHaveBeenCalledWith(
        expect.objectContaining({ analysis_budget: null }),
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
      grid_interval: "month",
      grid_count: 0,
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

    it("get reads a v1 experiment as a HEAD-only grid", async () => {
      experimentRepository["findOne"]!.mockResolvedValue(experiment);

      const summary = await service.get("org-1", "exp-1", user);

      expect(summary).toMatchObject({
        grid_interval: "month",
        grid_count: 0,
        grid_dates: [],
        analysis_budget: null,
      });
    });

    it("get reports the frozen grid dates, oldest first", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        ...experiment,
        grid_interval: "week",
        grid_count: 2,
      });

      const summary = await service.get("org-1", "exp-1", user);

      expect(summary.grid_dates).toEqual(["2026-10-23", "2026-10-30"]);
    });

    it("get estimates the analyses: every snapshot plus about two fix probes per entry per grid interval", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        ...experiment,
        grid_interval: "week",
        grid_count: 2,
      });
      // Three entries, each with two grid dates and HEAD
      runRepository["createQueryBuilder"]!().getRawMany.mockResolvedValue([
        { experiment_id: "exp-1", status: "pending", count: "9" },
      ]);

      const summary = await service.get("org-1", "exp-1", user);

      expect(summary.estimated_analyses).toBe(21);
    });

    it("get reports the analysis budget", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({
        ...experiment,
        analysis_budget: 500,
      });

      const summary = await service.get("org-1", "exp-1", user);

      expect(summary.analysis_budget).toBe(500);
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

    it("getRuns pages through the runs by entry rank, then grid date", async () => {
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
            grid_index: 1,
            grid_date: new Date("2026-10-06T00:00:00Z"),
            shared_from: { id: "run-0" },
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
          order: { dataset_entry: { rank: "ASC" }, grid_index: "ASC" },
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
            grid_index: 1,
            grid_date: new Date("2026-10-06T00:00:00Z"),
            shared_from_run_id: "run-0",
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

    it("refuses an experiment that has Published results", async () => {
      experimentRepository["findOne"]!.mockResolvedValue({ id: "exp-1" });
      publishedRepository["exists"]!.mockResolvedValue(true);

      await expect(
        service.delete("org-1", "exp-1", user),
      ).rejects.toBeInstanceOf(EntityInUse);

      expect(publishedRepository["exists"]).toHaveBeenCalledWith({
        where: { experiment: { id: "exp-1" } },
      });
      expect(experimentRepository["delete"]).not.toHaveBeenCalled();
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
});
