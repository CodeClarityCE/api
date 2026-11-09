import { AuthenticatedUser, ROLE } from "src/base_modules/auth/auth.types";
import { MemberRole } from "src/base_modules/organizations/memberships/orgMembership.types";
import { type MembershipsRepository } from "src/base_modules/shared/repositories";
import { EntityNotFound, NotAuthorized } from "src/types/error.types";

import { ExperimentFiguresService } from "./experiment-figures.service";
import { ExperimentResultsService } from "./experiment-results.service";
import {
  FigureVersionNotCurrent,
  InvalidFigureDefinition,
} from "./experiments.errors";

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

/** Object keys as Postgres jsonb returns them: shortest first, then bytewise. */
function asJsonb(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map(asJsonb);
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort((a, b) => a.length - b.length || (a < b ? -1 : 1))
      .map((key) => [key, asJsonb(record[key])]),
  );
}

const INSTANCE = {
  run_id: "aH",
  affected_dependency: "lodash",
  vulnerability_id: "GHSA-1",
  severity_class: "HIGH",
  epss_score: null,
  conflict_flag: "MATCH_CORRECT",
  winning_source: "OSV",
  withdrawn_date: null,
  published_date: "2025-02-15T10:00:00Z",
};

describe("ExperimentFiguresService", () => {
  /** Rewrites a saved definition's key order, as a real reload from jsonb does */
  const reloadFromJsonb = (id: string): void => {
    const figure = saved.find((candidate) => candidate["id"] === id)!;
    figure["definition"] = asJsonb(figure["definition"]);
  };

  const user = new AuthenticatedUser("user-1", [ROLE.USER], true);
  const experiment = { id: "exp-1", ended_on: CREATED_ON };
  let service: ExperimentFiguresService;
  let hasRequiredRole: jest.Mock;
  let experimentFindOne: jest.Mock;
  let runFind: jest.Mock;
  /** The saved Figures, as the mocked repository holds them */
  let saved: Record<string, unknown>[];
  /** The stored Published results versions */
  let versions: { id: string; metric_version: number }[];
  /** The Figure data stored for a version */
  let frozen: Record<string, unknown>[];
  /** The experiment's copied instances; a change here is a change in the rows */
  let instances: object[];

  beforeEach(() => {
    saved = [];
    versions = [{ id: "pub-1", metric_version: 1 }];
    frozen = [];
    instances = [INSTANCE];
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
        getRawMany: jest.fn(async () => rows),
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
        createQueryBuilder: jest.fn(() => rowsBuilder(instances)),
      } as never,
      { query: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
    );
    service = new ExperimentFiguresService(
      { hasRequiredRole } as unknown as MembershipsRepository,
      { findOne: experimentFindOne } as never,
      figureRepository as never,
      {
        findOne: jest.fn(
          async ({ where }: { where: { metric_version: number } }) =>
            versions.find(
              (version) => version.metric_version === where.metric_version,
            ) ?? null,
        ),
      } as never,
      {
        findOne: jest.fn(
          async ({
            where,
          }: {
            where: {
              published_results: { id: string };
              definition_key: string;
            };
          }) =>
            frozen.find(
              (row) =>
                (row["published_results"] as { id: string }).id ===
                  where.published_results.id &&
                row["definition_key"] === where.definition_key,
            ) ?? null,
        ),
        save: jest.fn(async (row: Record<string, unknown>) => {
          frozen.push(row);
          return row;
        }),
      } as never,
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
      metric_version: null,
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
        "survival",
        "fix_lag",
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
        filters: { dating_precision: "commit", sweep: "non_withdrawn" },
      });
      await compute({
        ...definition,
        filters: { sweep: "non_withdrawn", dating_precision: "commit" },
      });

      expect(runFind).toHaveBeenCalledTimes(1);
    });

    it("shares one computation between a preview and the reopened saved Figure", async () => {
      await compute();
      const id = await service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      );
      reloadFromJsonb(id);

      await service.getData("org-1", "exp-1", id, user);

      expect(runFind).toHaveBeenCalledTimes(1);
    });

    it("reads an ended experiment's rows once across different definitions", async () => {
      await compute();
      await compute({ ...DEFINITION, filters: { view: "as_of" } });

      expect(runFind).toHaveBeenCalledTimes(1);
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

  describe("tying a Figure to Published results", () => {
    const hindsight = async (id: string): Promise<unknown> =>
      (await service.getData("org-1", "exp-1", id, user)).series[0]!.values;
    const move = (id: string, version: number | null): Promise<unknown> =>
      service.moveToVersion("org-1", "exp-1", id, version, user);
    const createTied = async (): Promise<string> => {
      const id = await service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      );
      await move(id, 1);
      return id;
    };
    const publishCorrectedMetrics = (): void => {
      mockMetricVersion = 2;
      versions.push({ id: "pub-2", metric_version: 2 });
      instances = [INSTANCE, { ...INSTANCE, vulnerability_id: "GHSA-2" }];
    };

    it("serves a tied Figure after its definition is reloaded from jsonb", async () => {
      const id = await createTied();
      reloadFromJsonb(id);

      expect(await hindsight(id)).toEqual([1]);
    });

    it("keeps a tied Figure's stored data under the canonical key of an edit", async () => {
      const id = await createTied();
      const edited = { ...DEFINITION, filters: { view: "as_of" } };

      await service.update("org-1", "exp-1", id, { definition: edited }, user);
      reloadFromJsonb(id);

      expect(
        (await service.getData("org-1", "exp-1", id, user)).series[0]!.key,
      ).toBe("as_of");
    });

    it("renames a tied Figure on an older version without computing anything", async () => {
      const id = await service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      );
      reloadFromJsonb(id);
      await move(id, 1);
      publishCorrectedMetrics();

      await service.update(
        "org-1",
        "exp-1",
        id,
        { name: "Renamed", definition: DEFINITION },
        user,
      );

      expect((await service.get("org-1", "exp-1", id, user)).name).toBe(
        "Renamed",
      );
      expect(await hindsight(id)).toEqual([1]);
    });

    it("still refuses a real definition change on an older version", async () => {
      const id = await createTied();
      reloadFromJsonb(id);
      publishCorrectedMetrics();

      await expect(
        service.update(
          "org-1",
          "exp-1",
          id,
          {
            name: "Renamed",
            definition: { ...DEFINITION, filters: { view: "as_of" } },
          },
          user,
        ),
      ).rejects.toBeInstanceOf(FigureVersionNotCurrent);
    });

    it("reports the version a Figure is tied to", async () => {
      const id = await createTied();

      expect(
        (await service.get("org-1", "exp-1", id, user)).metric_version,
      ).toBe(1);
    });

    it("keeps a tied Figure's data when a newer version is published", async () => {
      const id = await createTied();

      publishCorrectedMetrics();

      expect(await hindsight(id)).toEqual([1]);
      expect(
        (await service.get("org-1", "exp-1", id, user)).metric_version,
      ).toBe(1);
    });

    it("moves a Figure to a newer version only when asked", async () => {
      const id = await createTied();
      publishCorrectedMetrics();

      await move(id, 2);

      expect(await hindsight(id)).toEqual([2]);
    });

    it("moves back to a version whose data is stored after the metric code changed", async () => {
      const id = await createTied();
      publishCorrectedMetrics();
      await move(id, 2);

      await move(id, 1);

      expect(await hindsight(id)).toEqual([1]);
    });

    it("refuses a version it cannot compute with the current metric code", async () => {
      const id = await service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      );
      publishCorrectedMetrics();

      await expect(move(id, 1)).rejects.toBeInstanceOf(FigureVersionNotCurrent);
      expect(
        (await service.get("org-1", "exp-1", id, user)).metric_version,
      ).toBeNull();
    });

    it("does not find a version the experiment does not have", async () => {
      const id = await createTied();

      await expect(move(id, 9)).rejects.toBeInstanceOf(EntityNotFound);
    });

    it("computes a Figure that is not tied from the current rows", async () => {
      const id = await service.create(
        "org-1",
        "exp-1",
        { name: "Load", definition: DEFINITION },
        user,
      );

      publishCorrectedMetrics();

      expect(await hindsight(id)).toEqual([2]);
    });

    it("returns a Figure to a draft when untied", async () => {
      const id = await createTied();
      publishCorrectedMetrics();

      await move(id, null);

      expect(await hindsight(id)).toEqual([2]);
      expect(
        (await service.get("org-1", "exp-1", id, user)).metric_version,
      ).toBeNull();
    });

    it("freezes the new definition when a tied Figure is edited", async () => {
      const id = await createTied();

      await service.update(
        "org-1",
        "exp-1",
        id,
        { definition: { ...DEFINITION, filters: { view: "as_of" } } },
        user,
      );

      expect(
        (await service.getData("org-1", "exp-1", id, user)).series[0]!.key,
      ).toBe("as_of");
    });

    it("refuses an edit of a tied Figure the metric code can no longer compute", async () => {
      const id = await createTied();
      publishCorrectedMetrics();

      await expect(
        service.update(
          "org-1",
          "exp-1",
          id,
          { definition: { ...DEFINITION, filters: { view: "as_of" } } },
          user,
        ),
      ).rejects.toBeInstanceOf(FigureVersionNotCurrent);
      expect(
        (await service.get("org-1", "exp-1", id, user)).definition,
      ).toEqual(DEFINITION);
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
