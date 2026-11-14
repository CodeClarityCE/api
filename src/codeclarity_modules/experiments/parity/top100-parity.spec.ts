/**
 * Parity with the archived js-vuln-study (spec #23, "Acceptance (parity)"):
 * the 98 done HEAD runs of the top100 study, raw results trimmed by
 * build-top100-fixture.ts, go through the row copy and the aggregates and
 * must reproduce its results_numbers.json (top100-expected.json holds the
 * compared blocks). That JSON rounds floats to 10 significant digits in
 * `sweep`, hence the relative tolerance.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";

import {
  aggregateExperimentResults,
  type ExperimentResults,
  type ResultsSummaryInput,
  type ResultsVulnerabilityInput,
} from "../experiment-results";
import { mapRunRows, unwrapResultEnvelope } from "../experiment-row-copy";

import type { ParityFixtureRun } from "./build-top100-fixture";

const PARITY_SUBSETS = ["all", "match_correct_only", "non_withdrawn"];

function loadFixture(): ParityFixtureRun[] {
  return brotliDecompressSync(
    readFileSync(join(__dirname, "top100-head.jsonl.br")),
  )
    .toString("utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as ParityFixtureRun);
}

interface Expected {
  headline: unknown;
  sweep: { subset: string }[];
  epss: unknown;
  match_flags: unknown;
  winning_source_head: unknown;
  rqc: unknown;
  rqd: unknown;
}

function isClose(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-12 + 1e-9 * Math.abs(expected);
}

/** Paths where `actual` differs from `expected`, numbers within tolerance. */
function differences(actual: unknown, expected: unknown, path = "$"): string[] {
  if (typeof expected === "number" && typeof actual === "number") {
    return isClose(actual, expected)
      ? []
      : [`${path}: ${actual} != ${expected}`];
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      return [`${path}: length ${actual.length} != ${expected.length}`];
    }
    return expected.flatMap((item, i) =>
      differences(actual[i], item, `${path}[${i}]`),
    );
  }
  if (
    typeof expected === "object" &&
    expected !== null &&
    typeof actual === "object" &&
    actual !== null &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    const keys = new Set([...Object.keys(a), ...Object.keys(e)]);
    return [...keys].flatMap((key) =>
      key in a && key in e
        ? differences(a[key], e[key], `${path}.${key}`)
        : [`${path}.${key}: ${key in a ? "unexpected" : "missing"}`],
    );
  }
  return actual === expected
    ? []
    : [`${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`];
}

describe("parity with the archived top100 HEAD study", () => {
  let results: ExperimentResults;
  const expected = JSON.parse(
    readFileSync(join(__dirname, "top100-expected.json"), "utf8"),
  ) as Expected;

  beforeAll(() => {
    const fixture = loadFixture();
    const summaries: ResultsSummaryInput[] = [];
    const vulnerabilities: ResultsVulnerabilityInput[] = [];
    for (const run of fixture) {
      const rows = mapRunRows(
        unwrapResultEnvelope(run.sbom),
        unwrapResultEnvelope(run.vulns),
      );
      summaries.push({ ...rows.summary, run_id: run.run_id, rank: run.rank });
      for (const row of rows.vulnerabilities) {
        vulnerabilities.push({ ...row, run_id: run.run_id });
      }
    }
    results = aggregateExperimentResults({
      runs: fixture.map(() => ({ status: "done", error: null })),
      summaries,
      vulnerabilities,
      provenance: {
        api_version: null,
        analyzer_steps: null,
        knowledge_start: null,
        knowledge_end: null,
        created_by: null,
        created_on: new Date(0),
        started_on: null,
        ended_on: null,
      },
    });
  }, 120_000);

  it.each([
    "headline",
    "epss",
    "match_flags",
    "winning_source_head",
    "rqc",
    "rqd",
  ] as const)("matches %s", (block) => {
    expect(differences(results[block], expected[block])).toEqual([]);
  });

  it("matches the sweep subsets v1 computes", () => {
    const sweep = expected.sweep.filter((row) =>
      PARITY_SUBSETS.includes(row.subset),
    );
    expect(differences(results.sweep, sweep)).toEqual([]);
  });

  it("reports full coverage of the 98 done runs", () => {
    expect(results.coverage).toMatchObject({ runs: 98, done: 98 });
  });
});
