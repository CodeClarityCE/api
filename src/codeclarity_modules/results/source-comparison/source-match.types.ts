// Shapes vuln-finder writes for comparing knowledge sources.

export interface SourceRange {
  introduced?: string;
  fixed?: string;
}

export interface SourceAffected {
  ranges: SourceRange[];
  exact: string[];
  universal: boolean;
}

// A GHSA label has type "GHSA", a class and a zero score.
export interface SourceSeverity {
  score: number;
  type: string;
  vector: string;
  class: string;
}

// One knowledge source's claim about a vulnerability instance.
export interface SourceMatch {
  source: string;
  record_id: string;
  winning: boolean;
  affected: SourceAffected;
  evidence: string;
  severity: SourceSeverity | null;
  /** Every CVSS vector of the record; absent on older analyses. */
  vectors?: SourceSeverity[];
  published?: string;
  modified?: string;
}

// What one knowledge source said about a vulnerability instance.
export enum SourceVerdictValue {
  Matched = "matched",
  /** The source was healthy and had no matching record. */
  NoRecord = "no_record",
  /** The source had no match while stale, failed or of unknown state. */
  StaleOrFailed = "stale_or_failed",
}

// What a verdict rests on; fields a verdict does not use are absent.
export interface SourceVerdictEvidence {
  /** The matched records, for a matched verdict. */
  record_ids?: string[];
  /** The source's sync state ("stale", "failed" or "unknown"), for a stale or failed verdict. */
  source_status?: string;
}

// One knowledge source's verdict on a vulnerability instance.
export interface SourceVerdict {
  source: string;
  verdict: SourceVerdictValue;
  evidence?: SourceVerdictEvidence;
}

// The fields of a vulnerability instance the comparison reads.
export interface ComparedVulnerability {
  VulnerabilityId: string;
  AffectedDependency: string;
  AffectedVersion: string;
  SourceMatches?: SourceMatch[];
}

export interface ComparedWorkspace {
  Vulnerabilities?: ComparedVulnerability[];
}
