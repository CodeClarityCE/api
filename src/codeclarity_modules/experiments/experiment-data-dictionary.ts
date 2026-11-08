/** data_dictionary.md of the replication package, in glossary terms. Pure. */
import type {
  EXPOSURE_CSV_COLUMNS,
  FIX_CSV_COLUMNS,
  RUN_CSV_COLUMNS,
  VULNERABILITY_CSV_COLUMNS,
} from "./experiment-csv";

/** One description per column; a new column without one fails to compile. */
type Described<Columns extends readonly string[]> = Record<
  Columns[number],
  string
>;

const ENTRY_RANK = "Star rank of the dataset entry, 0 for the most starred.";
const ENTRY_NAME = "GitHub owner and name of the dataset entry.";
const ENTRY_STARS =
  "GitHub stars of the dataset entry when the dataset was built.";
const ENTRY_URL = "Git URL of the dataset entry.";
const GRID_DATE = "Grid date of the snapshot as YYYY-MM-DD, or HEAD.";
const VULNERABILITY = "Identifier of the vulnerability (for example a CVE).";
const AFFECTED = "Name of the package the vulnerability affects.";
const SEVERITY_OF_EXPOSURE = "Severity class of the vulnerability.";
const PUBLISHED = "Publication date of the advisory; blank when unknown.";

const RUNS: Described<typeof RUN_CSV_COLUMNS> = {
  rank: ENTRY_RANK,
  full_name: ENTRY_NAME,
  stars: ENTRY_STARS,
  git_url: ENTRY_URL,
  grid_date: GRID_DATE,
  status: "How the experiment run ended: done, failed or skipped.",
  error:
    "Why the experiment run failed or was skipped, or why a done run is empty (no_lockfile_yet: the snapshot predates the lockfile).",
  attempts: "Analyses submitted for this experiment run.",
  branch: "Default branch the snapshot was pinned on.",
  commit_hash: "Commit the snapshot pins.",
  committed_at: "When the pinned commit was made.",
  analysis_id: "The analysis the experiment run produced, if any.",
  total_dependencies: "Dependencies resolved at the snapshot.",
  direct_dependencies: "Direct dependencies resolved at the snapshot.",
  transitive_dependencies: "Transitive dependencies resolved at the snapshot.",
  dev_dependencies: "Development dependencies resolved at the snapshot.",
  prod_dependencies: "Production dependencies resolved at the snapshot.",
  package_manager: "Package manager of the project at the snapshot.",
  total_vulnerabilities:
    "Load of the project: its vulnerability instances at the snapshot.",
  vulnerable_dependencies:
    "Dependencies with at least one vulnerability instance.",
  direct_vulnerabilities: "Vulnerability instances on direct dependencies.",
  transitive_vulnerabilities:
    "Vulnerability instances on transitive dependencies.",
  n_critical: "Vulnerability instances of severity class critical.",
  n_high: "Vulnerability instances of severity class high.",
  n_medium: "Vulnerability instances of severity class medium.",
  n_low: "Vulnerability instances of severity class low.",
  n_none: "Vulnerability instances of severity class none.",
};

const VULNERABILITIES: Described<typeof VULNERABILITY_CSV_COLUMNS> = {
  rank: ENTRY_RANK,
  full_name: ENTRY_NAME,
  stars: ENTRY_STARS,
  git_url: ENTRY_URL,
  grid_date:
    "Grid date of the snapshot holding this row as YYYY-MM-DD, or HEAD. Snapshots pinning the same commit share one analysis and its rows (see runs.csv).",
  commit_hash: "Commit of the snapshot holding this row.",
  workspace:
    'Workspace the vulnerability instance belongs to ("." in a single-package repository).',
  vulnerability_id: VULNERABILITY,
  affected_dependency: AFFECTED,
  affected_version: "Resolved version of the affected package.",
  direct_dependency: "Whether the affected package is a direct dependency.",
  severity_class: "Severity class of the vulnerability.",
  severity_score: "Severity score of the vulnerability.",
  severity_vector: "Severity vector of the vulnerability.",
  impact: "Impact sub-score of the vulnerability.",
  exploitability: "Exploitability sub-score of the vulnerability.",
  epss_score: "EPSS score of the vulnerability; blank when it has none.",
  epss_percentile:
    "EPSS percentile of the vulnerability; blank when it has none.",
  conflict_flag:
    "How the advisory sources agreed on this match (MATCH_CORRECT when the match stands).",
  winning_source: "Advisory source whose match was kept.",
  published_date: "Publication date of the advisory, as its source gives it.",
  modified_date:
    "Last modification date of the advisory, as its source gives it.",
  withdrawn_date: "Withdrawal date of the advisory; blank unless withdrawn.",
};

const EXPOSURES: Described<typeof EXPOSURE_CSV_COLUMNS> = {
  rank: ENTRY_RANK,
  full_name: ENTRY_NAME,
  vulnerability_id: VULNERABILITY,
  affected_dependency: AFFECTED,
  severity: SEVERITY_OF_EXPOSURE,
  published_date: PUBLISHED,
  first_present:
    "Grid date of the first snapshot in which the exposure is present, or HEAD.",
  last_present:
    "Grid date of the last snapshot in which the exposure is present, or HEAD.",
  gaps: "Snapshots inside the exposure without a usable observation; a gap does not end an exposure.",
  status: "open when the exposure is still present at HEAD, else fixed.",
  introduction_date:
    "Date of the introduction; blank when the exposure was present at the first snapshot.",
  introduction_commit:
    "Commit the introduction is dated to, when one is known.",
  introduction_precision:
    "Dating precision of the introduction: commit or snapshot.",
  residence_days:
    "Days from the introduction to disclosure of the advisory; negative when the advisory was already public.",
  fix_date: "Date of the fix; blank while the exposure is open.",
  fix_commit: "Commit the fix is dated to, when one is known.",
  fix_precision: "Dating precision of the fix: commit or snapshot.",
  fix_kind: "Fix kind: upgraded, removed_direct or removed_transitive.",
  lag_days:
    "Days from disclosure of the advisory to the fix; negative when fixed before disclosure.",
};

const FIXES: Described<typeof FIX_CSV_COLUMNS> = {
  rank: ENTRY_RANK,
  full_name: ENTRY_NAME,
  vulnerability_id: VULNERABILITY,
  affected_dependency: AFFECTED,
  severity: SEVERITY_OF_EXPOSURE,
  published_date: PUBLISHED,
  fix_date: "Date of the fix.",
  fix_commit: "Commit the fix is dated to, when one is known.",
  fix_kind: "Fix kind: upgraded, removed_direct or removed_transitive.",
  precision: "Dating precision of the fix: commit or snapshot.",
  probe_outcome:
    "How the fix probes ended: found, ambiguous or not_found; blank when they had not finished.",
  probe_reason: "Why the fix probes did not date the fix to a commit.",
  interval_from: "Grid date of the snapshot before the fix.",
  interval_to: "Grid date of the first snapshot after the fix, or HEAD.",
  lag_days:
    "Days from disclosure of the advisory to the fix; negative when fixed before disclosure.",
};

const FILES: readonly [string, string, Record<string, string>][] = [
  ["runs.csv", "One row per experiment run (one per snapshot).", RUNS],
  [
    "vulnerabilities.csv",
    "One row per vulnerability instance, once per analyzed commit.",
    VULNERABILITIES,
  ],
  ["exposures.csv", "One row per exposure.", EXPOSURES],
  ["fixes.csv", "One row per fix.", FIXES],
];

/** data_dictionary.md: one table of column descriptions per CSV. */
export function dataDictionary(): string {
  const sections = FILES.map(([file, grain, columns]) => {
    const rows = Object.entries(columns).map(
      ([column, description]) => `| \`${column}\` | ${description} |`,
    );
    return [
      `## ${file}`,
      "",
      grain,
      "",
      "| Column | Meaning |",
      "| --- | --- |",
      ...rows,
    ].join("\n");
  });
  return `# Data dictionary\n\n${sections.join("\n\n")}\n`;
}
