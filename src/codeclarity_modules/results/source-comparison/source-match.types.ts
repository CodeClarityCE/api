// Shapes vuln-finder writes for comparing knowledge sources (see backend#28).

export interface SourceRange {
  introduced?: string;
  fixed?: string;
}

export interface SourceAffected {
  ranges: SourceRange[];
  exact: string[];
  universal: boolean;
}

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
