/**
 * The experiment row copy (ADR 0001): js-sbom and vuln-finder result JSON
 * flattened into one run summary row and one row per vulnerability instance,
 * with the column semantics of the archived js-vuln-study harness
 * (DATA_DICTIONARY.md, analyses.parquet and vulns.parquet).
 *
 * Pure and free of Nest and TypeORM imports, so a parity test can feed it the
 * archived raw JSON directly. Inputs are untyped on purpose: result blobs are
 * read back from jsonb and are only as well-formed as the plugin that wrote
 * them, so every field is checked rather than trusted.
 */
import type { VulnerableVersions } from "./experiment-vulnerable-versions";

/** The run summary columns (analyses.parquet). */
export interface RunSummaryRow {
  total_dependencies: number;
  direct_dependencies: number;
  transitive_dependencies: number;
  dev_dependencies: number;
  prod_dependencies: number;
  package_manager: string | null;
  /** Vulnerability instances: equals the number of instance rows */
  total_vulnerabilities: number;
  /** Unique affected package names */
  vulnerable_dependencies: number;
  /** Instances split by direct_dependency; they sum to total_vulnerabilities */
  direct_vulnerabilities: number;
  transitive_vulnerabilities: number;
  /** Instances per severity class; one without a class is in no bucket */
  n_critical: number;
  n_high: number;
  n_medium: number;
  n_low: number;
  n_none: number;
}

const SEVERITY_BUCKETS = {
  critical: "n_critical",
  high: "n_high",
  medium: "n_medium",
  low: "n_low",
  none: "n_none",
} as const satisfies Record<string, keyof RunSummaryRow>;

/** One vulnerability instance (vulns.parquet). */
export interface VulnerabilityInstanceRow {
  workspace: string;
  vulnerability_id: string | null;
  affected_dependency: string | null;
  affected_version: string | null;
  severity_class: string | null;
  severity_score: number | null;
  severity_vector: string | null;
  impact: number | null;
  exploitability: number | null;
  epss_score: number | null;
  epss_percentile: number | null;
  conflict_flag: string | null;
  winning_source: string | null;
  direct_dependency: boolean;
  /** Advisory timestamps verbatim from the source, which formats vary */
  published_date: string | null;
  modified_date: string | null;
  withdrawn_date: string | null;
  /** Affected versions of every source that matched, null when none did */
  vulnerable_versions: VulnerableVersions | null;
}

/** One package resolved in one workspace at a commit. */
export interface ProbePackage {
  workspace: string;
  name: string;
  version: string;
  direct: boolean;
}

/** A package as results read it: the same package across workspaces is one row. */
export type ResolvedPackage = Omit<ProbePackage, "workspace">;

export interface RunRows {
  summary: RunSummaryRow;
  vulnerabilities: VulnerabilityInstanceRow[];
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Empty strings count as absent, as the harness's `or None` did. */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectOrEmpty(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

/** The advisory record of one source's match, or {} when it has none. */
function matchedAdvisory(instance: JsonObject, key: string): JsonObject {
  return objectOrEmpty(objectOrEmpty(instance[key])["Vulnerability"]);
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const found = stringOrNull(value);
    if (found !== null) return found;
  }
  return null;
}

function instanceRow(
  workspace: string,
  instance: JsonObject,
): VulnerabilityInstanceRow {
  const severity = objectOrEmpty(instance["Severity"]);
  const epss = objectOrEmpty(instance["EPSS"]);
  const conflict = objectOrEmpty(instance["Conflict"]);
  const nvd = matchedAdvisory(instance, "NVDMatch");
  const osv = matchedAdvisory(instance, "OSVMatch");
  const gcve = matchedAdvisory(instance, "GCVEMatch");
  return {
    workspace,
    vulnerability_id: stringOrNull(instance["VulnerabilityId"]),
    affected_dependency: stringOrNull(instance["AffectedDependency"]),
    affected_version: stringOrNull(instance["AffectedVersion"]),
    severity_class: stringOrNull(severity["SeverityClass"]),
    severity_score: numberOrNull(severity["Severity"]),
    severity_vector: stringOrNull(severity["Vector"]),
    impact: numberOrNull(severity["Impact"]),
    exploitability: numberOrNull(severity["Exploitability"]),
    epss_score: numberOrNull(epss["Score"]),
    epss_percentile: numberOrNull(epss["Percentile"]),
    conflict_flag: stringOrNull(conflict["ConflictFlag"]),
    winning_source: stringOrNull(conflict["ConflictWinner"]),
    // vuln-finder writes `direct_dependency` (omitempty, so absent means
    // false). This deliberately differs from the archived harness, which read
    // a `DirectDependency` key that never exists and so always got false.
    direct_dependency: instance["direct_dependency"] === true,
    published_date: firstString(
      nvd["Published"],
      osv["published"],
      gcve["datePublished"],
    ),
    modified_date: firstString(
      nvd["LastModified"],
      osv["modified"],
      gcve["dateUpdated"],
    ),
    withdrawn_date: stringOrNull(osv["withdrawn"]),
    vulnerable_versions: vulnerableVersions(instance),
  };
}

/** A vuln-finder Semver as a version string, null for the zero (unset) one. */
function semverString(value: unknown): string | null {
  if (!isObject(value)) return null;
  const [major, minor, patch] = ["Major", "Minor", "Patch"].map(
    (key) => numberOrNull(value[key]) ?? 0,
  );
  const pre = stringOrNull(value["PreReleaseTag"]);
  if (!major && !minor && !patch && pre === null) return null;
  return `${major}.${minor}.${patch}${pre === null ? "" : `-${pre}`}`;
}

/** Any non-empty string or true flag inside: Go's non-zero struct. */
function hasContent(value: unknown): boolean {
  if (typeof value === "string") return value !== "";
  if (value === true) return true;
  if (Array.isArray(value)) return value.some(hasContent);
  return isObject(value) && Object.values(value).some(hasContent);
}

/** The union of the affected versions of every source match flagged vulnerable. */
function vulnerableVersions(instance: JsonObject): VulnerableVersions | null {
  const matches = ["OSVMatch", "NVDMatch", "GCVEMatch"]
    .map((key) => objectOrEmpty(instance[key]))
    .filter((match) => match["Vulnerable"] === true);
  if (matches.length === 0) return null;
  const versions: VulnerableVersions = {
    ranges: [],
    exact: [],
    universal: false,
  };
  for (const match of matches) {
    const affected = Array.isArray(match["AffectedInfo"])
      ? match["AffectedInfo"]
      : [];
    for (const info of affected.filter(isObject)) {
      for (const range of Array.isArray(info["Ranges"])
        ? info["Ranges"].filter(isObject)
        : []) {
        versions.ranges.push({
          introduced: semverString(range["IntroducedSemver"]),
          fixed: semverString(range["FixedSemver"]),
        });
      }
      for (const exact of Array.isArray(info["Exact"])
        ? info["Exact"].filter(isObject)
        : []) {
        const version = stringOrNull(exact["VersionString"]);
        if (version !== null) versions.exact.push(version);
      }
      if (hasContent(info["Universal"])) versions.universal = true;
    }
  }
  return versions;
}

/** [workspace name, workspace payload] for every well-formed workspace. */
function workspaces(blob: unknown): [string, JsonObject][] {
  if (!isObject(blob) || !isObject(blob["workspaces"])) return [];
  return Object.entries(blob["workspaces"]).filter(
    (entry): entry is [string, JsonObject] => isObject(entry[1]),
  );
}

/**
 * Whether a stored plugin result can be copied: an object with workspaces,
 * from a plugin that did not report failure. A run whose analysis succeeded
 * is only done when both of its results are usable.
 */
export function isUsablePluginResult(blob: unknown): boolean {
  if (!isObject(blob) || !isObject(blob["workspaces"])) return false;
  return objectOrEmpty(blob["analysis_info"])["status"] !== "failure";
}

/** Why a done run is empty: its snapshot predates the repo or its lockfile */
export const NO_LOCKFILE_YET = "no_lockfile_yet";

/** What js-sbom reports when a commit has no JavaScript project or lockfile. */
const NO_LOCKFILE_ERRORS = [
  "no lock file found",
  "no package.json and lock file pair found",
  "cannot be analyzed by JavaScript analyzer",
];

/** A failed js-sbom result whose commit had no lockfile yet. */
export function isNoLockfileResult(blob: unknown): boolean {
  if (!isObject(blob)) return false;
  // js-sbom's early failures use the camelCase key
  const info = objectOrEmpty(blob["analysis_info"] ?? blob["analysisInfo"]);
  if (info["status"] !== "failure" || !Array.isArray(info["errors"])) {
    return false;
  }
  return info["errors"].some((error: unknown) => {
    const description = isObject(error)
      ? objectOrEmpty(error["private_error"])["description"]
      : null;
    return (
      typeof description === "string" &&
      NO_LOCKFILE_ERRORS.some((message) => description.endsWith(message))
    );
  });
}

/** What the dispatcher records when it finds no manifest it can analyze. */
const NO_SUPPORTED_MANIFEST_REASON =
  "no supported manifest was found in this project";

/** An analysis the dispatcher failed because its commit has no manifest. */
export function isNoManifestFailure(reason?: string | null): boolean {
  return reason === NO_SUPPORTED_MANIFEST_REASON;
}

/**
 * The plugin payload of a Result entity as the results endpoint returns it
 * ({result, plugin, created_on}), as the archived raw JSON stores it.
 * Anything else is returned as is.
 */
export function unwrapResultEnvelope(raw: unknown): unknown {
  return isObject(raw) && isObject(raw["result"]) ? raw["result"] : raw;
}

/**
 * Flatten one done run's plugin results.
 * @param sbom The js-sbom result payload (unwrapped)
 * @param vulns The vuln-finder result payload (unwrapped)
 */
export function mapRunRows(sbom: unknown, vulns: unknown): RunRows {
  const summary: RunSummaryRow = {
    total_dependencies: 0,
    direct_dependencies: 0,
    transitive_dependencies: 0,
    dev_dependencies: 0,
    prod_dependencies: 0,
    package_manager: isObject(sbom)
      ? stringOrNull(
          isObject(sbom["analysis_info"])
            ? sbom["analysis_info"]["package_manager"]
            : null,
        )
      : null,
    total_vulnerabilities: 0,
    vulnerable_dependencies: 0,
    direct_vulnerabilities: 0,
    transitive_vulnerabilities: 0,
    n_critical: 0,
    n_high: 0,
    n_medium: 0,
    n_low: 0,
    n_none: 0,
  };

  for (const [, ws] of workspaces(sbom)) {
    const byName = ws["dependencies"];
    if (!isObject(byName)) continue;
    for (const versions of Object.values(byName)) {
      if (!isObject(versions)) continue;
      for (const flags of Object.values(versions)) {
        if (!isObject(flags)) continue;
        summary.total_dependencies++;
        if (flags["Direct"]) summary.direct_dependencies++;
        if (flags["Transitive"]) summary.transitive_dependencies++;
        if (flags["Dev"]) summary.dev_dependencies++;
        if (flags["Prod"]) summary.prod_dependencies++;
      }
    }
  }

  const vulnerabilities: VulnerabilityInstanceRow[] = [];
  for (const [name, ws] of workspaces(vulns)) {
    const instances = ws["Vulnerabilities"];
    if (!Array.isArray(instances)) continue;
    for (const instance of instances) {
      if (isObject(instance)) vulnerabilities.push(instanceRow(name, instance));
    }
  }

  const affected = new Set<string>();
  for (const row of vulnerabilities) {
    if (row.affected_dependency !== null) affected.add(row.affected_dependency);
    if (row.direct_dependency) summary.direct_vulnerabilities++;
    else summary.transitive_vulnerabilities++;
    const bucket = row.severity_class?.toLowerCase();
    if (bucket !== undefined && Object.hasOwn(SEVERITY_BUCKETS, bucket)) {
      summary[SEVERITY_BUCKETS[bucket as keyof typeof SEVERITY_BUCKETS]]++;
    }
  }
  summary.total_vulnerabilities = vulnerabilities.length;
  summary.vulnerable_dependencies = affected.size;

  return { summary, vulnerabilities };
}

/** Every (workspace, package, version) a js-sbom result resolves, with its direct flag. */
export function mapProbePackages(sbom: unknown): ProbePackage[] {
  const packages: ProbePackage[] = [];
  for (const [workspace, ws] of workspaces(sbom)) {
    for (const [name, versions] of Object.entries(
      objectOrEmpty(ws["dependencies"]),
    )) {
      for (const [version, flags] of Object.entries(objectOrEmpty(versions))) {
        if (!isObject(flags)) continue;
        packages.push({
          workspace,
          name,
          version,
          direct: flags["Direct"] === true,
        });
      }
    }
  }
  return packages;
}
