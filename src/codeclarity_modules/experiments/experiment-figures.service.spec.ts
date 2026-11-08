import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";

import { ExperimentFiguresService } from "./experiment-figures.service";
import { ExperimentResultsService } from "./experiment-results.service";
import { InvalidFigureDefinition } from "./experiments.errors";

// The cache key reads the metric version; tests move it to prove that.
let mockMetricVersion = 1;
jest.mock("./experiment-metric-version", () => ({
  get METRIC_VERSION(): number {
    return mockMetricVersion;
  },
}));

const DEFINITION = {
  metric: "load_over_time",
  chart_form: "line",
  group_by: null,
  filters: { view: "hindsight" },
};

const CREATED_ON = new Date("2026-11-01T10:00:00Z");

describe("ExperimentFiguresService", () => {
  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  const experiment = { id: "exp-1", ended_on: CREATED_ON };
  let service: ExperimentFiguresService;
  let hasRequiredRole: jest.Mock;
  let experimentFindOne: jest.Mock;
  let runFind: jest.Mock;
  /** The saved Figures, as the mocked repository holds them */
  let saved: Record<string, unknown>[];

  beforeEach(() => {
    saved = [];
    mockMetricVersion = 1;
    runFind = jest.fn().mockResolvedValue([
      {
        id: "aH",
        status: "done",
        error: null,
        grid_index: 0,
        grid_date: null,
        shared_from: null,
      },
    ]);
    hasRequiredRole = jest.fn().mockResolvedValue(undefined);
    experimentFindOne = jest.fn().mockResolvedValue(experiment);
    const figureRepository = {
      find: jest.fn(async () => saved),
      findOne: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          saved.find((figure) => figure["id"] === where.id) ?? null,
      ),
      create: jest.fn((figure: object) => ({
        id: `fig-${saved.length + 1}`,
        ...figure,
      })),
      save: jest.fn(async (figure: Record<string, unknown>) => {
        if (!saved.includes(figure)) saved.push(figure);
        return figure;
      }),
      remove: jest.fn(async (figure: Record<string, unknown>) => {
        saved = saved.filter((candidate) => candidate !== figure);
      }),
    };
    const rowsBuilder = (rows: object[]): Record<string, jest.Mock> => {
      const builder: Record<string, jest.Mock> = {
        getRawMany: jest.fn().mockResolvedValue(rows),
      };
      for (const method of [
        "innerJoin",
        "select",
        "addSelect",
        "where",
        "andWhere",
      ]) {
        builder[method] = jest.fn().mockReturnValue(builder);
      }
      return builder;
    };
    const resultsService = new ExperimentResultsService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      { findOne: experimentFindOne } as never,
      { find: runFind } as never,
      {
        createQueryBuilder: jest.fn(() =>
          rowsBuilder([
            {
              run_id: "aH",
              rank: 0,
              total_dependencies: 5,
              total_vulnerabilities: 1,
              package_manager: "npm",
            },
          ]),
        ),
      } as never,
      {
        createQueryBuilder: jest.fn(() =>
          rowsBuilder([
            {
              run_id: "aH",
              affected_dependency: "lodash",
              vulnerability_id: "GHSA-1",
              severity_class: "HIGH",
              epss_score: null,
              conflict_flag: "MATCH_CORRECT",
              winning_source: "OSV",
              withdrawn_date: null,
              published_date: "2025-02-15T10:00:00Z",
            },
          ]),
        ),
      } as never,
      { query: jest.fn().mockResolvedValue([]) } as never,
    );
    service = new ExperimentFiguresService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      { findOne: experimentFindOne } as never,
      figureRepository as never,
      resultsService,
    );
  });

  it("saves a Figure that reopens and regenerates identically", async () => {
    const id = await service.create(
      "org-1",
      "exp-1",
      { name: "Load", definition: DEFINITION },
      user,
    );
    const preview = await service.computeData(
      "org-1",
      "exp-1",
      DEFINITION,
      user,
    );

    const figure = await service.get("org-1", "exp-1", id, user);
    const regenerated = await service.computeData(
      "org-1",
      "exp-1",
      figure.definition,
      user,
    );

    expect(figure).toEqual({
      id,
      name: "Load",
      definition: DEFINITION,
      created_on: expect.any(Date),
    });
    expect(regenerated).toEqual(preview);
    expect(regenerated.series).toEqual([
      { key: "hindsight", label: "Hindsight", values: [1] },
    ]);
  });

  it("serves the catalog the composer offers", async () => {
    const catalog = await service.catalog("org-1", "exp-1", user);

    expect(catalog.metrics.map((metric) => metric.id)).toEqual(
      expect.arrayContaining([
        "load_over_time",
        "residence",
        "concentration",
        "severity_mix",
        "stars_vs_load",
        "upstream_leverage",
      ]),
    );
    expect(catalog.metrics[0]!.chart_forms).toEqual([
      { id: "line", label: "Line" },
    ]);
  });

  it.each([
    ["an unknown metric", { ...DEFINITION, metric: "stars_on_mars" }],
    ["a chart form the metric lacks", { ...DEFINITION, chart_form: "pie" }],
    ["a group-by the metric lacks", { ...DEFINITION, group_by: "severity" }],
    ["an unknown filter", { ...DEFINITION, filters: { weather: "rain" } }],
    ["an unknown filter option", { ...DEFINITION, filters: { view: "live" } }],
    ["an extra key", { ...DEFINITION, sql: "drop table" }],
    ["something not an object", "load_over_time"],
    [
      "a group-by another chart form of the metric allows",
      {
        metric: "upstream_leverage",
        chart_form: "line",
        group_by: "fix_kind",
        filters: {},
      },
    ],
    [
      "a filter another chart form of the metric allows",
      {
        metric: "upstream_leverage",
        chart_form: "line",
        group_by: null,
        filters: { dating_precision: "commit" },
      },
    ],
    [
      "a date range that is reversed",
      {
        metric: "residence",
        chart_form: "histogram",
        group_by: null,
        filters: { date_range: "2025-06-01/2025-01-01" },
      },
    ],
    [
      "a date range with an impossible day",
      {
        metric: "residence",
        chart_form: "histogram",
        group_by: null,
        filters: { date_range: "2025-02-30/" },
      },
    ],
    [
      "a date range with no ends",
      {
        metric: "residence",
        chart_form: "histogram",
        group_by: null,
        filters: { date_range: "/" },
      },
    ],
    [
      "a view on a metric read only in hindsight",
      {
        metric: "residence",
        chart_form: "histogram",
        group_by: null,
        filters: { view: "as_of" },
      },
    ],
  ])("rejects %s on save and on compute", async (_, definition) => {
    await expect(
      service.create("org-1", "exp-1", { name: "Bad", definition }, user),
    ).rejects.toBeInstanceOf(InvalidFigureDefinition);
    await expect(
      service.computeData("org-1", "exp-1", definition, user),
    ).rejects.toBeInstanceOf(InvalidFigureDefinition);
    expect(saved).toHaveLength(0);
  });

  it("rejects an update that leaves the catalog and keeps the old definition", async () => {
    const id = await service.create(
      "org-1",
      "exp-1",
      { name: "Load", definition: DEFINITION },
      user,
    );

    await expect(
      service.update(
        "org-1",
        "exp-1",
        id,
        { definition: { ...DEFINITION, chart_form: "pie" } },
        user,
      ),
    ).rejects.toBeInstanceOf(InvalidFigureDefinition);
    expect((await service.get("org-1", "exp-1", id, user)).definition).toEqual(
      DEFINITION,
    );
  });

  describe("repeated previews", () => {
    const compute = (definition: object = DEFINITION): Promise<unknown> =>
      service.computeData("org-1", "exp-1", definition, user);

    it("does not recompute an identical definition", async () => {
      const first = await compute();
      const second = await compute();

      expect(second).toEqual(first);
      expect(runFind).toHaveBeenCalledTimes(1);
    });

    it("treats the same filters in another order as identical", async () => {
      const definition = {
        metric: "residence",
        chart_form: "histogram",
        group_by: null,
      };

      await compute({
        ...definition,
        filters: { dating_precision: "commit", sweep_subset: "all" },
      });
      await compute({
        ...definition,
        filters: { sweep_subset: "all", dating_precision: "commit" },
      });

      expect(runFind).toHaveBeenCalledTimes(1);
    });

    it("computes each different definition", async () => {
      await compute();
      await compute({ ...DEFINITION, filters: { view: "as_of" } });

      expect(runFind).toHaveBeenCalledTimes(2);
    });

    it("recomputes after the metric version changes", async () => {
      await compute();
      mockMetricVersion = 2;
      await compute();

      expect(runFind).toHaveBeenCalledTimes(2);
    });

    it("keeps computing an experiment that has not ended", async () => {
      experimentFindOne.mockResolvedValue({ id: "exp-1", ended_on: null });

      await compute();
      await compute();

      expect(runFind).toHaveBeenCalledTimes(2);
    });

    it("checks access before serving a cached preview", async () => {
      await compute();
      hasRequiredRole.mockRejectedValue(new NotAuthorized());

      await expect(compute()).rejects.toBeInstanceOf(NotAuthorized);
    });

    it("does not keep a failed computation", async () => {
      runFind.mockRejectedValueOnce(new Error("database down"));

      await expect(compute()).rejects.toThrow("database down");
      await expect(compute()).resolves.toBeDefined();
    });
  });

  it("lists, renames and deletes Figures", async () => {
    const id = await service.create(
      "org-1",
      "exp-1",
      { name: "Load", definition: DEFINITION },
      user,
    );

    await service.update("org-1", "exp-1", id, { name: "Renamed" }, user);
    expect(
      (await service.list("org-1", "exp-1", user)).map((f) => f.name),
    ).toEqual(["Renamed"]);

    await service.delete("org-1", "exp-1", id, user);
    expect(await service.list("org-1", "exp-1", user)).toEqual([]);
  });

  it("requires membership of the experiment's organization everywhere", async () => {
    hasRequiredRole.mockRejectedValue(new NotAuthorized());

    const calls = [
      service.catalog("org-1", "exp-1", user),
      service.list("org-1", "exp-1", user),
      service.get("org-1", "exp-1", "fig-1", user),
      service.computeData("org-1", "exp-1", DEFINITION, user),
      service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      ),
      service.update("org-1", "exp-1", "fig-1", { name: "New" }, user),
      service.delete("org-1", "exp-1", "fig-1", user),
    ];

    for (const call of calls) {
      await expect(call).rejects.toBeInstanceOf(NotAuthorized);
    }
    expect(hasRequiredRole).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      MemberRole.USER,
    );
    expect(saved).toHaveLength(0);
  });

  it("does not find an experiment of another organization", async () => {
    experimentFindOne.mockResolvedValue(null);

    await expect(service.list("org-2", "exp-1", user)).rejects.toBeInstanceOf(
      EntityNotFound,
    );
  });

  it("does not find a Figure outside the experiment", async () => {
    await expect(
      service.get("org-1", "exp-1", "fig-of-another", user),
    ).rejects.toBeInstanceOf(EntityNotFound);
  });
});
