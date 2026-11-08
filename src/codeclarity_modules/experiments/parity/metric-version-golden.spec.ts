/**
 * Guards the metric version: every published output of the top100 grid
 * fixture is hashed and compared with the hashes recorded for the current
 * METRIC_VERSION. To record a new version, bump METRIC_VERSION and run this
 * spec with UPDATE_METRIC_GOLDEN=1.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  FIGURE_CATALOG,
  type FigureDefinition,
  type FigureFilter,
  type FigureMetric,
  type FigureMetricId,
} from "../experiment-figure-catalog";
import { computeFigureData, type FigureRows } from "../experiment-figure-data";
import { METRIC_VERSION } from "../experiment-metric-version";
import { aggregateExperimentResults } from "../experiment-results";

import {
  fixtureLines,
  type GridFixtureEntry,
  resultsInput,
} from "./build-top100-grid-fixture";

type Hashes = Record<string, string>;

const GOLDEN = join(__dirname, "metric-version-golden.json");
const ENDED_ON = new Date("2026-08-31T00:00:00Z");
const DATE_RANGE = "2024-01-01/2025-12-31";

/** Key order is not output, and floats differ in their last digits per platform. */
function canonical(value: unknown): unknown {
  if (typeof value === "number") return Number(value.toPrecision(10));
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}

function hash(value: unknown): string {
  const plain: unknown = JSON.parse(JSON.stringify(value ?? null));
  return createHash("sha256")
    .update(JSON.stringify(canonical(plain)))
    .digest("hex")
    .slice(0, 16);
}

/** One value per filter: its last option differs most from no filter. */
function filterCases(
  filters: readonly FigureFilter[],
): Record<string, string>[] {
  return filters.flatMap((filter) => {
    const value =
      filter.kind === "date_range" ? DATE_RANGE : filter.options.at(-1)?.id;
    return value ? [{ [filter.id]: value }] : [];
  });
}

/** Each chart form plain, then with each grouping and each filter alone. */
function catalogDefinitions(metric: FigureMetric): FigureDefinition[] {
  return metric.chart_forms.flatMap((form) => {
    const base = {
      metric: metric.id as FigureMetricId,
      chart_form: form.id,
      group_by: null,
      filters: {},
    };
    const groups = metric.group_by.filter(
      (group) => !form.group_by || form.group_by.includes(group.id),
    );
    const filters = metric.filters.filter(
      (filter) => !form.filters || form.filters.includes(filter.id),
    );
    return [
      base,
      ...groups.map((group) => ({ ...base, group_by: group.id })),
      ...filterCases(filters).map((chosen) => ({ ...base, filters: chosen })),
    ];
  });
}

function currentHashes(): Hashes {
  const entries = fixtureLines(
    readFileSync(join(__dirname, "top100-grid.jsonl.br")),
  )
    .slice(0, -1)
    .map((line) => JSON.parse(line) as GridFixtureEntry);
  const input = { ...resultsInput(entries), read_at: ENDED_ON };

  const hashes: Hashes = {};
  const results = aggregateExperimentResults(input);
  for (const [block, value] of Object.entries(results)) {
    hashes[`results.${block}`] = hash(value);
  }
  const rows: FigureRows = {
    runs: input.runs,
    vulnerabilities: input.vulnerabilities,
    probes: input.probes ?? [],
    probe_intervals: input.probe_intervals ?? [],
    probe_analyses: input.probe_analyses ?? [],
    summaries: input.summaries,
    head_cutoff: ENDED_ON,
  };
  const metrics: readonly FigureMetric[] = FIGURE_CATALOG.metrics;
  for (const metric of metrics) {
    hashes[`figure.${metric.id}`] = hash(
      catalogDefinitions(metric).map((definition) =>
        computeFigureData(rows, definition),
      ),
    );
  }
  return hashes;
}

function readGolden(): Record<string, Hashes> {
  return existsSync(GOLDEN)
    ? (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, Hashes>)
    : {};
}

describe("the metric version guard", () => {
  let current: Hashes;

  beforeAll(() => {
    current = currentHashes();
    const golden = readGolden();
    if (process.env["UPDATE_METRIC_GOLDEN"] && !golden[METRIC_VERSION]) {
      golden[METRIC_VERSION] = current;
      writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 2)}\n`);
    }
  }, 600_000);

  it("has recorded output for the current metric version", () => {
    expect(Object.keys(readGolden())).toContain(String(METRIC_VERSION));
  });

  it("fails when metric output changes without a metric version bump", () => {
    const recorded = readGolden()[METRIC_VERSION] ?? {};
    const blocks = new Set([...Object.keys(recorded), ...Object.keys(current)]);
    const changed = [...blocks].filter(
      (block) => recorded[block] !== current[block],
    );
    expect(changed).toEqual([]);
  });

  it("covers every results block and Figure metric", () => {
    expect(Object.keys(current)).toEqual(
      expect.arrayContaining([
        "results.headline",
        "results.bootstrap_intervals",
        "figure.survival",
        "figure.load_over_time",
      ]),
    );
  });
});
