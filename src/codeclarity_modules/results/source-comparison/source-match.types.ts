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
