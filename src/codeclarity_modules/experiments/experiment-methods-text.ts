/** methods.md of the replication package, generated from the results. Pure. */
import type {
  CoverageBlock,
  ExperimentResults,
  GridCoverageRow,
  KnowledgeSnapshot,
} from "./experiment-results";
import {
  type ConfidenceInterval,
  NORMAL_INTERVAL_CONFIDENCE,
} from "./experiment-stats";

export interface MethodsInput {
  experiment_name: string;
  metric_version: number;
  published_on: Date;
  results: ExperimentResults;
}

const percent = (share: number): string => `${(share * 100).toFixed(1)}%`;

/** Run errors are free text: keep them on one line of the document. */
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

function reasons(label: string, counts: Record<string, number>): string[] {
  const entries = Object.entries(counts);
  if (entries.length === 0) return [];
  const list = entries
    .map(([reason, count]) => `${oneLine(reason)} (${count})`)
    .join("; ");
  return [`${label}: ${list}.`];
}

function coverageStatement(results: ExperimentResults): string {
  const head: CoverageBlock = results.coverage;
  const grid = results.grid_coverage;
  const sum = (field: keyof GridCoverageRow): number =>
    grid.reduce((total, row) => total + Number(row[field]), 0);
  return [
    `At HEAD, ${head.done} of ${head.runs} experiment runs ended done, ${head.failed} failed and ${head.skipped} were skipped.`,
    ...reasons("Failure reasons at HEAD", head.failure_reasons),
    ...reasons("Skip reasons at HEAD", head.skip_reasons),
    `Over all ${sum("runs")} experiment runs of the snapshot grid, ${sum("failed")} failed and ${sum("skipped")} were skipped; ${sum("empty")} done runs were empty because the snapshot had no lockfile yet.`,
    "Reasons per run are in runs.csv.",
  ].join(" ");
}

function fixDatingStatement(results: ExperimentResults): string {
  const { fixes, snapshot_precision_share: share } = results.fix_lag;
  if (fixes === 0 || share === null) {
    return "No fixes were observed, so fix dating does not apply.";
  }
  return `Of all fixes (n = ${fixes}), ${results.exposures.fix_precision.snapshot} (${percent(share)}) are dated only to a snapshot interval.`;
}

function asOfStatement(results: ExperimentResults): string {
  const general =
    "The As-of view is an approximation: each snapshot is analysed once with the knowledge available at analysis time, and the As-of view then drops vulnerability instances whose advisory was published after the snapshot's grid date. An advisory later withdrawn, re-scored or given a wider affected range appears in its current form, not as it read on the grid date.";
  const undated = results.load_over_time.reduce(
    (total, row) => total + row.undated,
    0,
  );
  return undated > 0
    ? `${general} ${undated} vulnerability instances without a readable publication date are kept in the As-of view.`
    : general;
}

function describeKnowledge(knowledge: KnowledgeSnapshot): string {
  const sources = Object.entries(knowledge.knowledge_sources)
    .map(([source, stamp]) => `${source} ${stamp ?? "not recorded"}`)
    .join(", ");
  return `${sources} (${knowledge.epss_rows} EPSS rows)`;
}

/** The mixed knowledge statements; empty when knowledge never differed. */
function mixedKnowledgeStatements(results: ExperimentResults): string[] {
  const { provenance } = results;
  const statements: string[] = [];
  if (
    provenance.knowledge_changed &&
    provenance.knowledge_start &&
    provenance.knowledge_end
  ) {
    statements.push(
      `The knowledge changed during the experiment, from ${describeKnowledge(provenance.knowledge_start)} to ${describeKnowledge(provenance.knowledge_end)}.`,
    );
  }
  const mixed = results.grid_coverage
    .filter((row) => row.mixed_knowledge)
    .map((row) => row.grid_date ?? "HEAD");
  if (mixed.length > 0) {
    statements.push(
      `Experiment runs were matched against different knowledge at these snapshots: ${mixed.join(", ")}.`,
    );
  }
  return statements.length > 0
    ? [`**Mixed knowledge.** ${statements.join(" ")}`]
    : [];
}

function missingKnowledgeStatement(results: ExperimentResults): string[] {
  const { knowledge_start: start, knowledge_end: end } = results.provenance;
  return start && end
    ? []
    : [
        "**Knowledge stamps.** The knowledge at the start or end of the experiment was not recorded, so a change of knowledge during the experiment cannot be ruled out.",
      ];
}

function limitations(results: ExperimentResults): string[] {
  return [
    `**As-of view.** ${asOfStatement(results)}`,
    `**Fix dating.** ${fixDatingStatement(results)}`,
    `**Failed and skipped runs.** ${coverageStatement(results)}`,
    ...mixedKnowledgeStatements(results),
    ...missingKnowledgeStatement(results),
  ];
}

function studyDescription(results: ExperimentResults): string {
  const steps = results.provenance.analyzer_steps;
  const analyzer = steps
    ? `The analyzer (${steps
        .flat()
        .map((step) => `${step.name} ${step.version}`)
        .join(", ")})`
    : "The analyzer (its steps were not recorded)";
  const dates = results.grid_coverage.flatMap((row) =>
    row.grid_date === null ? [] : [row.grid_date],
  );
  const grid =
    dates.length === 0
      ? "HEAD only"
      : `${dates.length} grid ${dates.length === 1 ? "date" : "dates"} from ${dates[0]} to ${dates[dates.length - 1]}, plus HEAD`;
  const runs = results.grid_coverage.reduce((sum, row) => sum + row.runs, 0);
  return `${analyzer} ran over every snapshot of the dataset entries (n = ${results.coverage.runs}): ${grid}. There were ${runs} experiment runs.`;
}

function knowledgeDescription(results: ExperimentResults): string[] {
  const { knowledge_start: start } = results.provenance;
  return start
    ? [
        `The knowledge at the start of the experiment was ${describeKnowledge(start)}.`,
      ]
    : [];
}

const confidenceLabel = (confidence: number): string =>
  `${(confidence * 100).toFixed(0)}%`;

function interval(
  bounds: { low: number; high: number } | null | undefined,
  format: (value: number) => string,
  confidence: number,
): string {
  return bounds
    ? `${confidenceLabel(confidence)} interval ${format(bounds.low)} to ${format(bounds.high)}`
    : "interval not available";
}

const wilson = (bounds: ConfidenceInterval | null): string =>
  interval(bounds, percent, NORMAL_INTERVAL_CONFIDENCE);

/** The headline point estimates with their intervals. */
function headlineEstimates(results: ExperimentResults): string[] {
  const { headline, share_intervals: shares, provenance } = results;
  const bootstrap = results.bootstrap_intervals?.headline;
  const resampled = (
    bounds: { low: number; high: number } | null | undefined,
  ): string =>
    interval(
      bounds,
      (value) => value.toFixed(2),
      provenance.bootstrap.confidence,
    );
  const lines: string[] = [];
  if (headline.affected_share !== null) {
    lines.push(
      `At HEAD, ${headline.n_affected} of ${headline.n_projects} projects have at least one vulnerability instance: ${percent(headline.affected_share)} (${wilson(shares.headline.affected_share)}).`,
    );
  }
  if (headline.load_median !== null) {
    lines.push(
      `The median load at HEAD is ${headline.load_median.toFixed(2)} (${resampled(bootstrap?.load_median)}).`,
    );
  }
  if (headline.gini_pkg !== null && headline.gini_proj !== null) {
    lines.push(
      `At HEAD, the Gini coefficient of load is ${headline.gini_pkg.toFixed(2)} over packages (${resampled(bootstrap?.gini_pkg)}) and ${headline.gini_proj.toFixed(2)} over projects (${resampled(bootstrap?.gini_proj)}).`,
    );
  }
  return lines;
}

function concentrationStatement(results: ExperimentResults): string {
  const { headline, share_intervals: shares } = results;
  if (headline.top10_pkg_share === null || headline.top10_proj_share === null) {
    return "No vulnerability instances were observed at HEAD, so top-10 concentration does not apply.";
  }
  return [
    `At HEAD, the 10 most affected packages hold ${percent(headline.top10_pkg_share)} of vulnerability instances (${wilson(shares.headline.top10_pkg_share)}).`,
    `At HEAD, the 10 most affected projects hold ${percent(headline.top10_proj_share)} of vulnerability instances (${wilson(shares.headline.top10_proj_share)}).`,
    "These top-10 concentration intervals treat vulnerability instances as independent, and the top 10 are chosen after seeing the data.",
  ].join(" ");
}

function statisticalMethods(results: ExperimentResults): string[] {
  const { bootstrap } = results.provenance;
  const normal = confidenceLabel(NORMAL_INTERVAL_CONFIDENCE);
  return [
    `Shares use ${normal} Wilson intervals. Kaplan-Meier survival curves use ${normal} Greenwood log-log bands, with open exposures censored at HEAD.`,
    `Medians and Gini coefficients use a ${bootstrap.method}, with ${confidenceLabel(bootstrap.confidence)} confidence, ${bootstrap.resamples} resamples and seed ${bootstrap.seed}.`,
    concentrationStatement(results),
  ];
}

/** methods.md: study description, statistical methods, limitations, ethics. */
export function methodsText(input: MethodsInput): string {
  const { results } = input;
  return [
    `# Methods: ${oneLine(input.experiment_name)}`,
    `Published results, metric version ${input.metric_version}, published ${input.published_on.toISOString().slice(0, 10)}.`,
    "## Study",
    studyDescription(results),
    ...knowledgeDescription(results),
    ...headlineEstimates(results),
    "## Statistical methods",
    ...statisticalMethods(results),
    "## Limitations",
    ...limitations(results),
    "## Ethics",
    "Only already-public advisories on public repositories are reported.",
    "",
  ].join("\n\n");
}
