import {
  ADVISORY_SOURCES,
  dateKind,
  type DisclosureLag,
  FIX_RELEASE_DATED_SOURCES,
  round,
} from "src/codeclarity_modules/knowledge/comparison/comparison.types";

import type {
  AnalysisSourceSnapshot,
  ComparedVulnerability,
  ComparedWorkspace,
  SourceAffected,
  SourceMatch,
} from "./source-match.types";

const DAY_MS = 86_400_000;

export interface InstanceCounts {
  total: number;
  compared: number;
  malicious_excluded: number;
  without_source_matches: number;
}

export interface SourceCoverage {
  source: string;
  // Source status in the analysis's snapshot; only healthy sources are compared.
  status: string;
  comparable: boolean;
  instances: number;
  only_source: number;
  winning: number;
}

export interface AnalysisSourceComparison {
  comparable: boolean;
  reason?: "predates_source_matches";
  instances: InstanceCounts;
  sources: SourceCoverage[];
  overlap: SourceOverlap[];
  severity: SeverityAgreement[];
  affected_versions: AffectedAgreement[];
  disclosure_lag: DisclosureLag[];
}

export interface AffectedAgreement {
  sources: [string, string];
  compared: number;
  // Instances where the sources' affected versions differ at all.
  disagreements: number;
  // Instances where the sources name different fixed versions.
  fixed_version_disagreements: number;
}

export interface SeverityAgreement {
  sources: [string, string];
  // Instances where both sources score with the same CVSS major version.
  compared: number;
  class_disagreements: number;
  different_cvss_versions: number;
  mean_score_difference: number | null;
}

export interface SourceOverlap {
  sources: [string, string];
  instances: number;
  same_origin: number;
  unknown_origin: number;
  corroborating: number;
}

export interface CompareInput {
  workspaces: Record<string, ComparedWorkspace>;
  snapshot: AnalysisSourceSnapshot | undefined;
  originOf: (match: SourceMatch) => string | undefined;
}

const isMalicious = (id: string): boolean => id.startsWith("MAL-");

// Compares the knowledge sources over one analysis's vulnerability instances.
export function compareAnalysisSources(
  input: CompareInput,
): AnalysisSourceComparison {
  const all: ComparedVulnerability[] = Object.values(input.workspaces).flatMap(
    (workspace) => workspace.Vulnerabilities ?? [],
  );
  const counts: InstanceCounts = {
    total: all.length,
    compared: 0,
    malicious_excluded: 0,
    without_source_matches: 0,
  };
  const compared: SourceMatch[][] = [];
  const comparedIds: string[] = [];
  for (const vulnerability of all) {
    const matches = vulnerability.SourceMatches ?? [];
    if (
      isMalicious(vulnerability.VulnerabilityId) ||
      (matches.length > 0 && matches.every((m) => isMalicious(m.record_id)))
    ) {
      counts.malicious_excluded++;
    } else if (matches.length === 0) {
      counts.without_source_matches++;
    } else {
      compared.push(matches);
      comparedIds.push(vulnerability.VulnerabilityId);
    }
  }
  counts.compared = compared.length;

  if (input.snapshot === undefined) {
    return {
      comparable: false,
      reason: "predates_source_matches",
      instances: counts,
      sources: [],
      overlap: [],
      severity: [],
      affected_versions: [],
      disclosure_lag: [],
    };
  }

  const snapshot = input.snapshot;
  const sources = ADVISORY_SOURCES.map((source) => {
    const entry = snapshot.sources.find((s) => s.source === source);
    const coverage: SourceCoverage = {
      source,
      status: entry?.status ?? "unknown",
      comparable: entry?.comparable ?? false,
      instances: 0,
      only_source: 0,
      winning: 0,
    };
    for (const matches of compared) {
      const mine = matches.filter((m) => m.source === source);
      if (mine.length === 0) continue;
      coverage.instances++;
      if (mine.some((m) => m.winning)) coverage.winning++;
      if (matches.every((m) => m.source === source)) coverage.only_source++;
    }
    return coverage;
  });

  const comparableSources = sources
    .filter((s) => s.comparable)
    .map((s) => s.source);
  const overlap: SourceOverlap[] = [];
  const severity: SeverityAgreement[] = [];
  const affectedVersions: AffectedAgreement[] = [];
  for (const [a, b] of sourcePairs(comparableSources)) {
    const shared = compared
      .map((matches) => ({
        left: matches.filter((m) => m.source === a),
        right: matches.filter((m) => m.source === b),
      }))
      .filter(({ left, right }) => left.length > 0 && right.length > 0);
    if (shared.length === 0) continue;
    overlap.push(overlapOf([a, b], shared, input.originOf));
    const shownPairs = shared.map(
      ({ left, right }): [SourceMatch, SourceMatch] => [
        shown(left),
        shown(right),
      ],
    );
    severity.push(severityOf([a, b], shownPairs));
    affectedVersions.push(affectedOf([a, b], shownPairs));
  }

  return {
    comparable: true,
    instances: counts,
    sources,
    overlap,
    severity,
    affected_versions: affectedVersions,
    disclosure_lag: lagBySource(
      earliestDates(compared, comparedIds, comparableSources).values(),
      comparableSources,
    ),
  };
}

// Every unordered pair of sources, each pair and the pair list sorted by name.
function sourcePairs(sources: string[]): [string, string][] {
  const sorted = [...sources].sort();
  const pairs: [string, string][] = [];
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) pairs.push([a, b]);
  });
  return pairs;
}

// Two sources corroborate only when every origin is known and none is shared.
function originRelation(
  left: SourceMatch[],
  right: SourceMatch[],
  originOf: (match: SourceMatch) => string | undefined,
): "same_origin" | "unknown_origin" | "corroborating" {
  const leftOrigins = left.map(originOf);
  const rightOrigins = right.map(originOf);
  const known = new Set(leftOrigins.filter((o) => o !== undefined));
  if (rightOrigins.some((o) => o !== undefined && known.has(o))) {
    return "same_origin";
  }
  if ([...leftOrigins, ...rightOrigins].includes(undefined)) {
    return "unknown_origin";
  }
  return "corroborating";
}

interface SharedInstance {
  left: SourceMatch[];
  right: SourceMatch[];
}

function overlapOf(
  sources: [string, string],
  shared: SharedInstance[],
  originOf: (match: SourceMatch) => string | undefined,
): SourceOverlap {
  const entry: SourceOverlap = {
    sources,
    instances: shared.length,
    same_origin: 0,
    unknown_origin: 0,
    corroborating: 0,
  };
  for (const { left, right } of shared) {
    entry[originRelation(left, right, originOf)]++;
  }
  return entry;
}

// A source's match for an instance: the shown one, else its first.
function shown(matches: SourceMatch[]): SourceMatch {
  return matches.find((m) => m.winning) ?? matches[0]!;
}

// CVSS_V3 and CVSS_V31 share a scale; CVSS_V2 classes differ.
function cvssMajor(type: string): string {
  return type.startsWith("CVSS_V3") ? "3" : type;
}

function severityOf(
  sources: [string, string],
  pairs: [SourceMatch, SourceMatch][],
): SeverityAgreement {
  const entry: SeverityAgreement = {
    sources,
    compared: 0,
    class_disagreements: 0,
    different_cvss_versions: 0,
    mean_score_difference: null,
  };
  let difference = 0;
  for (const [left, right] of pairs) {
    if (!left.severity || !right.severity) continue;
    if (cvssMajor(left.severity.type) !== cvssMajor(right.severity.type)) {
      entry.different_cvss_versions++;
      continue;
    }
    entry.compared++;
    if (left.severity.class !== right.severity.class) {
      entry.class_disagreements++;
    }
    difference += Math.abs(left.severity.score - right.severity.score);
  }
  if (entry.compared > 0) {
    entry.mean_score_difference = round(difference / entry.compared);
  }
  return entry;
}

// Affected versions as a comparable key; an introduced "0" is an open start.
function affectedKey(affected: SourceAffected): string {
  const ranges = affected.ranges
    .map(
      (r) =>
        `${r.introduced === "0" ? "" : (r.introduced ?? "")}<${r.fixed ?? ""}`,
    )
    .sort();
  return JSON.stringify([
    affected.universal,
    ranges,
    [...affected.exact].sort(),
  ]);
}

function fixedKey(affected: SourceAffected): string {
  const fixed = new Set(affected.ranges.map((r) => r.fixed ?? ""));
  return JSON.stringify([...fixed].sort());
}

function affectedOf(
  sources: [string, string],
  pairs: [SourceMatch, SourceMatch][],
): AffectedAgreement {
  const entry: AffectedAgreement = {
    sources,
    compared: pairs.length,
    disagreements: 0,
    fixed_version_disagreements: 0,
  };
  for (const [left, right] of pairs) {
    if (affectedKey(left.affected) !== affectedKey(right.affected)) {
      entry.disagreements++;
    }
    if (fixedKey(left.affected) !== fixedKey(right.affected)) {
      entry.fixed_version_disagreements++;
    }
  }
  return entry;
}

// Earliest date each source gives each vulnerability, by vulnerability id.
function earliestDates(
  compared: SourceMatch[][],
  ids: string[],
  sources: string[],
): Map<string, Map<string, number>> {
  const byVulnerability = new Map<string, Map<string, number>>();
  compared.forEach((matches, i) => {
    const dates = byVulnerability.get(ids[i]!) ?? new Map<string, number>();
    for (const m of matches) {
      const time = m.published ? Date.parse(m.published) : Number.NaN;
      if (!sources.includes(m.source) || Number.isNaN(time)) continue;
      dates.set(m.source, Math.min(dates.get(m.source) ?? time, time));
    }
    byVulnerability.set(ids[i]!, dates);
  });
  return byVulnerability;
}

// Lag of each source behind the earliest publication among the other sources.
export function lagBySource(
  datesByVulnerability: Iterable<Map<string, number>>,
  sources: string[],
): DisclosureLag[] {
  const lags = new Map(sources.map((s) => [s, [] as number[]]));
  const first = new Map(sources.map((s) => [s, 0]));
  for (const dates of datesByVulnerability) {
    const publishers = [...dates.keys()].filter(
      (s) => !FIX_RELEASE_DATED_SOURCES.has(s),
    );
    if (publishers.length === 0) continue;
    const reference = Math.min(...publishers.map((s) => dates.get(s)!));
    for (const [source, time] of dates) {
      const publishes = !FIX_RELEASE_DATED_SOURCES.has(source);
      if (publishes && publishers.length < 2) continue;
      lags.get(source)!.push((time - reference) / DAY_MS);
      if (publishes && time === reference) {
        first.set(source, first.get(source)! + 1);
      }
    }
  }
  return sources.map((source) => {
    const values = lags.get(source)!;
    return {
      source,
      date_kind: dateKind(source),
      compared: values.length,
      first: first.get(source)!,
      median_days: values.length ? round(median(values)) : null,
      mean_days: values.length
        ? round(values.reduce((a, b) => a + b, 0) / values.length)
        : null,
    };
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
